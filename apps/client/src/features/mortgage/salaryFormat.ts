/**
 * Чистые хелперы форматирования поля «Зарплата в месяц» (спека §4.2):
 * только цифры, максимум 13 знаков, живая группировка тысяч запятыми.
 */

/** Оставляет только цифры, режет до 13 знаков (лимит поля). */
export function digitsOnly(input: string): string {
  return input.replace(/\D/g, '').slice(0, 13);
}

/** Группирует строку цифр по тысячам запятыми: «1400» → «1,400». */
export function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
