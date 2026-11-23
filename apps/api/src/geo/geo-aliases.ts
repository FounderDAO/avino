/** Старые slug'и по id сущности (SEO AUD-15). */
export function groupAliases(rows: { entityId: string; oldSlug: string }[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const { entityId, oldSlug } of rows) {
    const list = map.get(entityId) ?? [];
    list.push(oldSlug);
    map.set(entityId, list);
  }
  return map;
}
