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

    const { user_id } = await req.json()
    if (!user_id) return json({ error: "user_id is required" }, 400)

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

    const dRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user_id}`, {
      method: "DELETE",
      headers: {
        apikey: supabaseServiceKey,
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
    })
    if (!dRes.ok && dRes.status !== 404) {
      const d = await dRes.json()
      return json({ error: d?.msg || "Failed to delete auth user" }, dRes.status)
    }

    await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${user_id}`, {
      method: "DELETE",
      headers: {
        apikey: supabaseServiceKey,
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
    })

    return json({ ok: true })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Internal error" }, 500)
  }
}

Deno.serve(main)
