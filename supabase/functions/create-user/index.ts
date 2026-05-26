async function main(req: Request): Promise<Response> {
  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return new Response(JSON.stringify({ error: "Missing Authorization" }), { status: 401 })

    const { email, password, name, role } = await req.json()
    if (!email || !password || !name) {
      return new Response(JSON.stringify({ error: "Email, password, and name are required" }), { status: 400 })
    }

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
    if (!r.ok || !d?.id) return new Response(JSON.stringify({ error: d?.msg || d?.message || "User creation failed" }), { status: r.status })

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
      await fetch(`${supabaseUrl}/auth/v1/admin/users/${d.id}`, { method: "DELETE", headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` } })
      return new Response(JSON.stringify({ error: "Failed to create profile" }), { status: 500 })
    }

    return new Response(JSON.stringify({ user: { id: d.id, email: d.email } }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }), { status: 500 })
  }
}

Deno.serve(main)
