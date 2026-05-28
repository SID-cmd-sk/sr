"""
SR Platform — Local Email Relay Server
Runs on port 3002. Receives email requests from the browser
and forwards them to GoDaddy SMTP using the credentials
sent in each request. No credentials stored here.

Usage:
    python email_server.py

Requirements:
    pip install flask flask-cors
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import smtplib, ssl, json, imaplib, time, uuid
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formatdate

IMAP_MAP = {
    'smtpout.secureserver.net': ('imap.secureserver.net', 993),
}

app = Flask(__name__)
CORS(app, origins=["https://sid-cmd-sk.github.io", "http://localhost", "http://127.0.0.1"])

@app.route('/health', methods=['GET'])
def health():
    return jsonify(ok=True, service='SR Email Relay', port=3002)

@app.route('/send-email', methods=['POST', 'OPTIONS'])
def send_email():
    if request.method == 'OPTIONS':
        return '', 204

    try:
        d = request.get_json(force=True)
    except Exception:
        return jsonify(error='Invalid JSON body'), 400

    required = ['host', 'port', 'username', 'password', 'to', 'subject', 'body']
    missing  = [k for k in required if not d.get(k)]
    if missing:
        return jsonify(error=f'Missing fields: {", ".join(missing)}'), 400

    host      = d['host']
    port      = int(d['port'])
    username  = d['username']
    password  = d['password']
    to        = d['to']
    bcc       = d.get('bcc', '')
    from_addr = d.get('from', username)
    subject   = d['subject']
    body      = d['body']
    save_sent = d.get('save_to_sent', False)

    envelope_to = [to]
    if bcc:
        for addr in bcc.split(','):
            a = addr.strip()
            if a:
                envelope_to.append(a)

    try:
        msg = MIMEMultipart('alternative')
        msg['From']           = from_addr
        msg['To']             = to
        msg['Subject']        = subject
        msg['Date']           = formatdate(localtime=True)
        msg['Message-ID']     = f'<{uuid.uuid4().hex}@sks3d.com>'
        msg['MIME-Version']   = '1.0'
        msg.attach(MIMEText(body, 'plain', 'utf-8'))
        raw = msg.as_string()

        ctx = ssl.create_default_context()
        with smtplib.SMTP_SSL(host, port, context=ctx) as server:
            server.login(username, password)
            server.sendmail(username, envelope_to, raw)

        # ── Save to Sent folder via IMAP ──────────────────────
        imap_err_msg = None
        if save_sent and host in IMAP_MAP:
            imap_host, imap_port = IMAP_MAP[host]
            try:
                imap = imaplib.IMAP4_SSL(imap_host, imap_port)
                imap.login(username, password)
                saved = False
                # List all folders and find one matching "sent"
                typ, folder_list = imap.list()
                sent_folder = None
                sent_keywords = ['sent', 'envoyé', 'gesendet', 'enviado', 'inviato']
                if typ == 'OK':
                    for line in folder_list:
                        decoded = line.decode(errors='replace')
                        for kw in sent_keywords:
                            if kw in decoded.lower():
                                parts = decoded.split(' "/" ')
                                if len(parts) > 1:
                                    name = parts[-1].strip().strip('"')
                                    if name.upper() != 'INBOX':
                                        sent_folder = name
                                        break
                        if sent_folder:
                            break
                folder_name = sent_folder or 'Sent'
                if sent_folder:
                    try:
                        imap.append(folder_name, '\\Seen', None, raw.encode('utf-8'))
                        print(f'  [IMAP] Saved to "{folder_name}"')
                        saved = True
                    except Exception as e:
                        imap_err_msg = f'IMAP append to "{folder_name}" failed: {e}'
                else:
                    imap_err_msg = f'No Sent folder found on IMAP server'
                imap.logout()
            except Exception as imap_err:
                imap_err_msg = str(imap_err)
                print(f'  [IMAP] Failed: {imap_err}')

        sent_log = f' + BCC {bcc}' if bcc else ''
        print(f'[Email] Sent to {to}{sent_log} | Subject: {subject}')
        resp = {'ok': True}
        if imap_err_msg:
            resp['imap_warning'] = imap_err_msg
        return jsonify(resp)

    except smtplib.SMTPAuthenticationError:
        return jsonify(error='Authentication failed — check email and password in Settings'), 401
    except smtplib.SMTPRecipientsRefused:
        return jsonify(error=f'Recipient refused: {to}'), 400
    except smtplib.SMTPException as e:
        return jsonify(error=f'SMTP error: {str(e)}'), 500
    except Exception as e:
        return jsonify(error=str(e)), 500


if __name__ == '__main__':
    print('─' * 50)
    print('  SR Platform — Email Relay Server')
    print('  Listening on http://localhost:3002')
    print('  Press Ctrl+C to stop')
    print('─' * 50)
    app.run(host='0.0.0.0', port=3002, debug=False)
