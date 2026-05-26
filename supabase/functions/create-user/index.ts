const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

async function main(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return json({ error: "Missing Authorization" }, 401)

    const { email, password, name, role } = await req.json()
    if (!email || !password || !name) {
      return json({ error: "Email, password, and name are required" }, 400)
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

    const meRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: authHeader, apikey: supabaseServiceKey },
    })
    if (meRes.status !== 200) return json({ error: "Unauthorized" }, 401)
    const me = await meRes.json()

    const pRes = await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${me.id}&select=role`, {
      headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` },
    })
    const profiles = await pRes.json()
    if (!Array.isArray(profiles) || profiles[0]?.role !== "Admin") {
      return json({ error: "Admin access required" }, 403)
    }

    const r = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: supabaseServiceKey,
        Authorization: `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { name, role: role || "User" } }),
    })
    const d = await r.json()
    if (!r.ok || !d?.id) {
      return json({ error: d?.msg || d?.message || "User creation failed" }, r.status)
    }

    const iRes = await fetch(`${supabaseUrl}/rest/v1/users`, {
      method: "POST",
      headers: {
        apikey: supabaseServiceKey,
        Authorization: `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ id: d.id, name, email, role: role || "User", status: "active" }),
    })
    if (!iRes.ok) {
      await fetch(`${supabaseUrl}/auth/v1/admin/users/${d.id}`, {
        method: "DELETE", headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` },
      })
      return json({ error: "Failed to create profile" }, 500)
    }

    return json({ user: { id: d.id, email: d.email } })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Internal error" }, 500)
  }
}

Deno.serve(main)
