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

    const { user_id, new_password } = await req.json()
    if (!user_id || !new_password) return json({ error: "user_id and new_password are required" }, 400)
    if (new_password.length < 6) return json({ error: "Password must be at least 6 characters" }, 400)

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

    const res = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user_id}`, {
      method: "PUT",
      headers: {
        apikey: supabaseServiceKey,
        Authorization: `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: new_password, email_confirm: true }),
    })
    if (!res.ok) {
      const d = await res.json()
      return json({ error: d?.msg || d?.message || "Password change failed" }, res.status)
    }

    return json({ success: true })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Internal error" }, 500)
  }
}

Deno.serve(main)
