import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isNotificationSoundEnabled,
  setNotificationSoundEnabled,
  nextSoundState,
  playNotificationSound,
} from './notificationSound';

beforeEach(() => window.localStorage.clear());

describe('настройка звука', () => {
  it('включён по умолчанию', () => {
    expect(isNotificationSoundEnabled()).toBe(true);
  });
  it('persist off → on', () => {
    setNotificationSoundEnabled(false);
    expect(isNotificationSoundEnabled()).toBe(false);
    setNotificationSoundEnabled(true);
    expect(isNotificationSoundEnabled()).toBe(true);
  });
});

describe('nextSoundState', () => {
  it('первый замер — без звука, ставит базу', () => {
    expect(nextSoundState(null, 3)).toEqual({ play: false, next: 3 });
  });
  it('рост → play', () => {
    expect(nextSoundState(2, 5)).toEqual({ play: true, next: 5 });
  });
  it('без изменений / уменьшение → тишина', () => {
    expect(nextSoundState(5, 5)).toEqual({ play: false, next: 5 });
    expect(nextSoundState(5, 2)).toEqual({ play: false, next: 2 });
  });
});

describe('playNotificationSound', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('no-op когда звук выключен', () => {
    setNotificationSoundEnabled(false);
    const ctor = vi.fn();
    vi.stubGlobal('AudioContext', ctor);
    playNotificationSound();
    expect(ctor).not.toHaveBeenCalled();
  });
  it('создаёт AudioContext и запускает осциллятор когда включён', () => {
    setNotificationSoundEnabled(true);
    const start = vi.fn();
    const connect = vi.fn();
    const ctx = {
      currentTime: 0,
      resume: vi.fn(),
      close: vi.fn(),
      destination: {},
      createGain: () => ({
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect,
      }),
      createOscillator: () => ({
        type: '',
        frequency: { setValueAtTime: vi.fn() },
        connect,
        start,
        stop: vi.fn(),
      }),
    };
    const ctor = vi.fn(() => ctx);
    vi.stubGlobal('AudioContext', ctor);
    playNotificationSound();
    expect(ctor).toHaveBeenCalled();
    expect(start).toHaveBeenCalled();
  });
});
