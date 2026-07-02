/**
 * notificationSound — локальная настройка и воспроизведение звука уведомлений.
 * Тумблер хранится в localStorage (бэкенд-контракта нет). Звук синтезируется
 * через WebAudio (короткий двухтоновый «динь»), без бинарного ассета.
 */

const STORAGE_KEY = 'avino.notifSound';

/** Включён ли звук. Нет записи → включён (default true). */
export function isNotificationSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(STORAGE_KEY) !== 'off';
}

/** Сохранить состояние тумблера. */
export function setNotificationSoundEnabled(on: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
}

/**
 * Решение о звуке при смене суммарного счётчика непрочитанного.
 * prev === null → первый замер: база без звука. Рост → play.
 */
export function nextSoundState(
  prev: number | null,
  total: number,
): { play: boolean; next: number } {
  if (prev === null) return { play: false, next: total };
  return { play: total > prev, next: total };
}

/**
 * Короткий сигнал. No-op если выключено / нет window / WebAudio недоступен.
 * AudioContext создаётся лениво и resume()-ится (браузер разрешает звук
 * только после взаимодействия пользователя со страницей).
 */
export function playNotificationSound(): void {
  if (typeof window === 'undefined') return;
  if (!isNotificationSoundEnabled()) return;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return;
  try {
    const ctx = new Ctor();
    void ctx.resume?.();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.15, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    gain.connect(ctx.destination);
    [880, 1175].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.12);
      osc.connect(gain);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.2);
    });
    window.setTimeout(() => void ctx.close?.(), 600);
  } catch {
    // Звук не критичен — тихо игнорируем.
  }
}
