/**
 * CBU (Центробанк РУз) provider. Эндпоинт USD:
 *   GET {baseUrl}/ru/arkhiv-kursov-valyut/json/USD/
 * Ответ — массив с одним объектом { Ccy:'USD', Rate:'12650.18', ... }.
 * Ключ не нужен. Нативный fetch (как Yandex/Eskiz).
 */
export function parseCbuUsdRate(json: unknown): string {
  if (!Array.isArray(json) || json.length === 0) {
    throw new Error('CBU payload is not a non-empty array');
  }
  const rate = (json[0] as { Rate?: unknown }).Rate;
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) {
    throw new Error(`CBU USD Rate is missing or not numeric: ${String(rate)}`);
  }
  return rate;
}

export async function fetchCbuUsdRate(baseUrl: string): Promise<string> {
  const res = await fetch(`${baseUrl}/ru/arkhiv-kursov-valyut/json/USD/`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`CBU request failed: HTTP ${res.status}`);
  }
  return parseCbuUsdRate(await res.json());
}
