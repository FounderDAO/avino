/** Параллельная обработка с ограничением; ошибка элемента не останавливает пул. */
export async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        await worker(item);
      } catch {
        // Ошибку фиксирует сам worker; пул продолжает.
      }
    }
  });
  await Promise.all(lanes);
}

/** Повтор при сетевых сбоях: `retries` дополнительных попыток с паузой `delayMs`, 2×`delayMs`, … */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number,
  shouldRetry: (e: unknown) => boolean,
  delayMs = 1000,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= retries || !shouldRetry(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
    }
  }
}
