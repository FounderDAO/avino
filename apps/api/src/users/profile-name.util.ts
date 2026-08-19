/**
 * Имя пользователя для карточек: `displayName` → «firstName lastName» → null
 * (та же логика, что ChatService.profileName для counterparty, API.md §13).
 */
export function profileName(
  profile: {
    displayName: string | null;
    firstName: string | null;
    lastName: string | null;
  } | null,
): string | null {
  if (!profile) {
    return null;
  }
  const display = profile.displayName?.trim();
  if (display) {
    return display;
  }
  const full = [profile.firstName, profile.lastName]
    .map((p) => p?.trim())
    .filter((p): p is string => Boolean(p))
    .join(' ');
  return full || null;
}
