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

    const sk = {
      apikey: supabaseServiceKey,
      Authorization: `Bearer ${supabaseServiceKey}`,
    }

    const dRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user_id}`, {
      method: "DELETE",
      headers: { ...sk, "Content-Type": "application/json" },
    })

    if (!dRes.ok && dRes.status !== 404) {
      const body = await dRes.text()
      if (body.includes("23503") || body.includes("foreign key")) {
        const rpc = await fetch(`${supabaseUrl}/rest/v1/rpc/delete_auth_user`, {
          method: "POST",
          headers: { ...sk, "Content-Type": "application/json" },
          body: JSON.stringify({ uid: user_id }),
        })
        if (!rpc.ok) {
          const t = await rpc.text()
          return json({ error: `RPC delete failed: ${t}` }, rpc.status)
        }
      } else {
        return json({ error: `Auth API ${dRes.status}: ${body}` }, dRes.status)
      }
    } else {
      await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${user_id}`, {
        method: "DELETE",
        headers: sk,
      })
    }

    return json({ ok: true })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Internal error" }, 500)
  }
}

Deno.serve(main)
