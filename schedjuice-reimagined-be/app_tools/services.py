from app_tools.models import UserEmail
from app_microsoft.mail import send_mail
from app_attachment.models import Attachment
import requests
from decouple import config
import json

API_KEY = config("GPTZERO_API_KEY")


def send_email_from_user_email(user_email: UserEmail, tenant):
    to = None
    if user_email.user:
        to = user_email.user.email
    else:
        to = user_email.email
    attachments = [i for i in Attachment.objects.filter(table_name="email", foreign_key=user_email.id).all()]

    send_mail(tenant, user_email.subject, user_email.html_body, to, attachments=attachments)


def detect_ai(text: str):
    res = requests.post(
        "https://api.gptzero.me/v2/predict/text",
        data=json.dumps({
            "document": text
        }),
        headers={
            "Content-Type": "application/json",
            "x-api-key": API_KEY
        },
        timeout=(5, 30),
    )
    return res
