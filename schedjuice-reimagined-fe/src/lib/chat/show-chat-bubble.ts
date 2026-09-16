export function shouldShowChatBubble(
  pathname: string,
  ownUserId?: number | null,
): boolean {
  if (pathname === "/chat" || pathname.startsWith("/chat/")) {
    return false;
  }

  if (pathname === "/home") {
    return true;
  }

  if (pathname === "/profile") {
    return true;
  }

  if (ownUserId == null) {
    return false;
  }

  const ownProfilePrefix = `/users/${ownUserId}`;
  return (
    pathname === ownProfilePrefix ||
    pathname.startsWith(`${ownProfilePrefix}/`)
  );
}
