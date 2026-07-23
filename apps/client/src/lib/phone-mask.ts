/**
 * phone-mask — маска узбекского номера телефона «+998 XX XXX XX XX».
 * Чистые функции без DOM: извлечение цифр абонента, форматирование для
 * отображения, E.164 для бэкенда, проверка полноты. Используются
 * компонентом PhoneField и формами с полем телефона.
 * Спека: docs/superpowers/specs/2026-07-17-phone-mask-design.md.
 */

/**
 * До 9 значащих цифр абонента из произвольного ввода.
 * Порядок эвристик:
 * 1) литеральный префикс маски/E.164 «+998» (возможно, частично стёртый:
 *    «+99…») — всегда код страны, не цифры абонента;
 * 2) ведущий 998 при >9 цифрах — вставка международного номера без «+»
 *    (998901234567); при ровно 9 цифрах 998… — это оператор 99, сохраняем;
 * 3) ведущая «8» при ровно 10 цифрах — местный формат (8 90 123 45 67).
 */
export function uzPhoneDigits(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('+')) {
    s = s.slice(1);
    for (const c of '998') {
      if (!s.startsWith(c)) break;
      s = s.slice(1);
    }
  }
  let digits = s.replace(/\D/g, '');
  if (digits.startsWith('998') && digits.length > 9) {
    digits = digits.slice(3);
  } else if (digits.startsWith('8') && digits.length === 10) {
    digits = digits.slice(1);
  }
  return digits.slice(0, 9);
}

/**
 * Отображаемое значение маски: '' без значащих цифр (чтобы был виден
 * placeholder), иначе «+998 » + цифры группами XX XXX XX XX (частично).
 */
export function formatUzPhone(raw: string): string {
  const d = uzPhoneDigits(raw);
  if (!d) return '';
  const groups = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)]
    .filter(Boolean);
  return `+998 ${groups.join(' ')}`;
}

/** E.164 для бэкенда: «+998XXXXXXXXX»; '' при отсутствии значащих цифр. */
export function uzPhoneE164(raw: string): string {
  const d = uzPhoneDigits(raw);
  return d ? `+998${d}` : '';
}

/** Полный номер: ровно 9 цифр абонента (валидация кнопок отправки). */
export function uzPhoneComplete(raw: string): boolean {
  return uzPhoneDigits(raw).length === 9;
}
