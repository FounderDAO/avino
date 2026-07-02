'use client';

import { useEffect, useRef } from 'react';
import { nextSoundState, playNotificationSound } from './notificationSound';

/**
 * Проигрывает звук при росте `total` (после первого замера — база без звука).
 * Держатель (шапка) смонтирован постоянно → ref переживает навигацию,
 * ложных сигналов на логине/переходах нет.
 */
export function useUnreadSound(total: number): void {
  const prevRef = useRef<number | null>(null);
  useEffect(() => {
    const { play, next } = nextSoundState(prevRef.current, total);
    if (play) playNotificationSound();
    prevRef.current = next;
  }, [total]);
}
