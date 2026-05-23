// supabase/functions/send-email/index.ts
// Uses deno-smtp (nodemailer-style) compatible with current Deno runtime

const ALLOWED_ORIGINS = ["https://sid-cmd-sk.github.io"];

function corsHeaders(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

async function sendViaTCP(params: {
  host: string; port: number; username: string; password: string;
  to: string; from: string; subject: string; body: string;
}) {
  const { host, port, username, password, to, from, subject, body } = params;

  // Connect TLS
  const conn = await Deno.connectTls({ hostname: host, port });
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const readLine = async (): Promise<string> => {
    const buf = new Uint8Array(4096);
    let out = '';
    while (true) {
      const n = await conn.read(buf);
      if (n === null) break;
      out += decoder.decode(buf.subarray(0, n));
      if (out.includes('\r\n')) break;
    }
    return out.trim();
  };

  const send = async (cmd: string) => {
    await conn.write(encoder.encode(cmd + '\r\n'));
  };

  const expect = async (code: string) => {
    const line = await readLine();
    if (!line.startsWith(code)) throw new Error(`SMTP error: ${line}`);
    return line;
  };

  await expect('220');
  await send(`EHLO sr-platform`);
  let ehloResp = '';
  // read multi-line EHLO response
  while (true) {
    const line = await readLine();
    ehloResp += line + '\n';
    if (line.startsWith('250 ') || (!line.startsWith('250') && !line.startsWith('250-'))) break;
  }

  await send('AUTH LOGIN');
  await expect('334');
  await send(btoa(username));
  await expect('334');
  await send(btoa(password));
  await expect('235');

  await send(`MAIL FROM:<${username}>`);
  await expect('250');
  await send(`RCPT TO:<${to}>`);
  await expect('250');
  await send('DATA');
  await expect('354');

  const msg = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
    ``,
    body,
    `.`,
  ].join('\r\n');
  await send(msg);
  await expect('250');
  await send('QUIT');
  conn.close();
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  let payload: { host:string; port:number; username:string; password:string; to:string; from:string; subject:string; body:string; };
  try { payload = await req.json(); }
  catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } }); }

  const { host, port, username, password, to, from: fromAddr, subject, body } = payload;
  if (!host || !username || !password || !to) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), {
      status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  try {
    await sendViaTCP({ host, port: port ?? 465, username, password, to, from: fromAddr || username, subject, body });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("SMTP error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
});