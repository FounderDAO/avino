'use client';

import { useEffect, useRef } from 'react';
import { nextSoundState, playNotificationSound } from './notificationSound';

/**
 * Проигрывает звук при росте `total` — но только когда данные готовы (`ready`).
 * Пока не готово (гость / первичная загрузка / после логаута) база сбрасывается
 * в null, поэтому первый готовый замер становится базой БЕЗ звука. Держатель
 * (шапка) смонтирован постоянно → ложных сигналов на логине/навигации нет.
 */
export function useUnreadSound(total: number, ready: boolean): void {
  const prevRef = useRef<number | null>(null);
  useEffect(() => {
    if (!ready) {
      prevRef.current = null;
      return;
    }
    const { play, next } = nextSoundState(prevRef.current, total);
    if (play) playNotificationSound();
    prevRef.current = next;
  }, [total, ready]);
}
