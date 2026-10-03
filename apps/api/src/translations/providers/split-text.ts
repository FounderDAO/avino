/**
 * Разрезать текст на части не длиннее `maxLength`, чтобы уложиться в лимит
 * провайдера на один запрос. Конкатенация частей равна исходному тексту (ничего
 * не теряется). Режем по самой «мягкой» границе в пределах окна: перевод строки →
 * конец предложения → пробел; жёсткий разрез — только если границ нет вовсе.
 */
export function splitTextForTranslation(
  text: string,
  maxLength: number,
): string[] {
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > maxLength) {
    const window = rest.slice(0, maxLength);
    let cut = window.lastIndexOf('\n') + 1;
    if (cut <= 0) {
      cut =
        Math.max(
          window.lastIndexOf('. '),
          window.lastIndexOf('! '),
          window.lastIndexOf('? '),
        ) + 2;
      if (cut <= 1) {
        cut = window.lastIndexOf(' ') + 1;
      }
    }
    if (cut <= 0) {
      cut = maxLength;
    }
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  chunks.push(rest);
  return chunks;
}
