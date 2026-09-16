import random


def generate_verification_code():
    # Generate a 6-digit verification code
    return str(random.randint(100000, 999999))
