/**
 * SEO-хелпер: meta description без обрыва посреди слова.
 * Схлопывает пробелы и переводы строк; если текст длиннее max — режет по последней
 * границе слова и ставит «…». Раньше description резался ровно на 155-м символе.
 */
export function metaDescription(text: string, max = 155): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.replace(/[\s,.;:–—-]+$/, '')}…`;
}
