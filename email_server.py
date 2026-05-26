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
import smtplib, ssl, json
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

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

    host     = d['host']
    port     = int(d['port'])
    username = d['username']
    password = d['password']
    to       = d['to']
    from_addr = d.get('from', username)
    subject  = d['subject']
    body     = d['body']

    try:
        # Build MIME message so From/To/Subject headers appear correctly
        msg = MIMEMultipart('alternative')
        msg['From']    = from_addr
        msg['To']      = to
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'plain', 'utf-8'))

        ctx = ssl.create_default_context()
        with smtplib.SMTP_SSL(host, port, context=ctx) as server:
            server.login(username, password)
            server.sendmail(username, to, msg.as_string())

        print(f'[Email] Sent to {to} | Subject: {subject}')
        return jsonify(ok=True)

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
