// supabase/functions/send-email/index.ts
// Deno-based Edge Function — replaces the smtpjs.com browser library.
// Receives SMTP credentials + message from the app and sends server-side,
// so credentials never leave to a 3rd-party CDN and CORS is not an issue.

import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts";

const ALLOWED_ORIGINS = [
  "https://sid-cmd-sk.github.io",
  // add more origins if needed
];

function corsHeaders(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  let payload: {
    host: string;
    port: number;
    username: string;
    password: string;
    to: string;
    from: string;
    subject: string;
    body: string;
  };

  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const { host, port, username, password, to, from: fromAddr, subject, body } = payload;

  if (!host || !username || !password || !to || !subject) {
    return new Response(JSON.stringify({ error: "Missing required fields: host, username, password, to, subject" }), {
      status: 400,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  try {
    const client = new SmtpClient();

    await client.connectTLS({
      hostname: host,                        // smtpout.secureserver.net
      port: port ?? 465,
      username,
      password,
    });

    await client.send({
      from: fromAddr || username,
      to,
      subject,
      content: body,
    });

    await client.close();

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("SMTP send error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
});
