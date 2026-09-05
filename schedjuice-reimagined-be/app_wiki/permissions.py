from app_auth.models import User
from app_course.models import UserCourse
from app_wiki.models import Item


def user_can_view_course_items(user: User, course_id: int) -> bool:
    if user.is_admin():
        return True
    return UserCourse.objects.filter(user=user, course_id=course_id).exists()


def user_can_view_item(user: User, item: Item) -> bool:
    if not item.course_id:
        return user.is_admin()
    return user_can_view_course_items(user, item.course_id)


def user_can_modify_item(user: User, item: Item) -> bool:
    if user.is_admin():
        return True
    if user.is_student():
        return False
    if item.created_by_id != user.id:
        return False
    if not item.course_id:
        return False
    return UserCourse.objects.filter(user=user, course_id=item.course_id).exists()


def get_item_breadcrumb_chain(item: Item) -> list[Item]:
    chain: list[Item] = []
    current: Item | None = item
    visited: set[int] = set()
    while current is not None:
        if current.id in visited:
            break
        visited.add(current.id)
        chain.append(current)
        current = current.parent
    return list(reversed(chain))
