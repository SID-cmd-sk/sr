async function main(req: Request): Promise<Response> {
  try {
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405 })
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return new Response(JSON.stringify({ error: "Missing Authorization" }), { status: 401 })

    const { user_id, new_password } = await req.json()
    if (!user_id || !new_password) return new Response(JSON.stringify({ error: "user_id and new_password are required" }), { status: 400 })
    if (new_password.length < 6) return new Response(JSON.stringify({ error: "Password must be at least 6 characters" }), { status: 400 })

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

    const meRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: authHeader, apikey: supabaseServiceKey },
    })
    if (meRes.status !== 200) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
    const me = await meRes.json()

    const pRes = await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${me.id}&select=role`, {
      headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` },
    })
    const profiles = await pRes.json()
    if (!Array.isArray(profiles) || profiles[0]?.role !== "Admin") {
      return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403 })
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
      return new Response(JSON.stringify({ error: d?.msg || d?.message || "Password change failed" }), { status: res.status })
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }), { status: 500 })
  }
}

Deno.serve(main)
