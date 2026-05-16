import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formatdate, make_msgid

SENDER_EMAIL   = "sidharth.kumar@sks3d.com"
RECEIVER_EMAIL = "Bansal.gaurav@sks3d.com"
SMTP_SERVER    = "smtpout.secureserver.net"
SMTP_PORT      = 465
sender_password = "Tanvi123@sks"

def send_email(subject, body):
    msg = MIMEMultipart()
    msg["From"]       = "Sidharth Kumar <sidharth.kumar@sks3d.com>"
    msg["To"]         = RECEIVER_EMAIL
    msg["Subject"]    = subject
    msg["Date"]       = formatdate(localtime=True)   # proper timestamp
    msg["Message-ID"] = make_msgid(domain="sks3d.com")  # unique ID
    msg["Reply-To"]   = SENDER_EMAIL

    msg.attach(MIMEText(body, "plain"))

    try:
        with smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT) as server:
            server.login(SENDER_EMAIL, sender_password)
            server.sendmail(SENDER_EMAIL, RECEIVER_EMAIL, msg.as_string())
        print("✅ Email sent successfully!")
    except Exception as e:
        print(f"❌ Failed: {e}")

send_email(
    subject = "automail",
    body    = """idkkkkkk"""
)