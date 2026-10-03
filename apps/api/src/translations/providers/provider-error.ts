/** Максимум символов тела ответа провайдера, попадающих в текст ошибки. */
const MAX_REASON_LENGTH = 300;

/**
 * Причина отказа провайдера перевода из тела не-OK ответа: Yandex кладёт её в
 * `message`, Google — в `error.message`; иначе берём сырое тело. Без неё сбой
 * вида «ключ истёк» неотличим от любого другого 4xx/5xx. Тело читается
 * best-effort — недоступное/пустое тело даёт пустую строку.
 */
export async function readProviderErrorReason(res: Response): Promise<string> {
  let raw = '';
  try {
    raw = (await res.text()).trim();
  } catch {
    return '';
  }

  let reason = raw;
  try {
    const json = JSON.parse(raw) as {
      message?: unknown;
      error?: { message?: unknown };
    };
    const message = json.error?.message ?? json.message;
    if (typeof message === 'string' && message) {
      reason = message;
    }
  } catch {
    // не JSON — оставляем сырое тело
  }
  return reason.slice(0, MAX_REASON_LENGTH);
}
