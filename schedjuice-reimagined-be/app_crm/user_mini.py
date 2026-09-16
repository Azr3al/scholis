def user_mini(user):
    if user is None:
        return None
    return {"id": user.id, "name": user.name, "email": user.email}
