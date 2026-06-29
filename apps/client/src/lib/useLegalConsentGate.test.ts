/**
 * useLegalConsentGate — поведенческая матрица (design 2026-06-29 §5).
 * Fail-safe: пока что-то грузится/ошибка — не показывать.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

let mockAuthed = true;
let mockSettings = {
  data: undefined as
    | { legalConsentRequired: boolean; legalConsentVersion: number }
    | undefined,
  isLoading: false,
  isError: false,
};
let mockMe = {
  data: undefined as
    | { legal_consent: { accepted_version: number | null } }
    | undefined,
  isLoading: false,
  isError: false,
};

vi.mock('@/store/hooks', () => ({ useAppSelector: () => mockAuthed }));
vi.mock('@/store/api/publicSettingsApi', () => ({
  useGetPublicSettingsQuery: () => mockSettings,
}));
vi.mock('@/store/api/authApi', () => ({ useGetMeQuery: () => mockMe }));

import { useLegalConsentGate } from './useLegalConsentGate';

const settings = (required: boolean, version: number) => ({
  data: { legalConsentRequired: required, legalConsentVersion: version },
  isLoading: false,
  isError: false,
});
const me = (accepted_version: number | null) => ({
  data: { legal_consent: { accepted_version } },
  isLoading: false,
  isError: false,
});

describe('useLegalConsentGate', () => {
  beforeEach(() => {
    mockAuthed = true;
    mockSettings = settings(true, 2);
    mockMe = me(null);
  });

  it('false для гостя (не вошёл)', () => {
    mockAuthed = false;
    expect(renderHook(() => useLegalConsentGate()).result.current).toBe(false);
  });

  it('false когда флаг выключен', () => {
    mockSettings = settings(false, 2);
    expect(renderHook(() => useLegalConsentGate()).result.current).toBe(false);
  });

  it('false пока грузятся настройки (fail-safe)', () => {
    mockSettings = { data: undefined, isLoading: true, isError: false };
    expect(renderHook(() => useLegalConsentGate()).result.current).toBe(false);
  });

  it('false при ошибке настроек (fail-safe)', () => {
    mockSettings = { data: undefined, isLoading: false, isError: true };
    expect(renderHook(() => useLegalConsentGate()).result.current).toBe(false);
  });

  it('false пока грузится me (fail-safe)', () => {
    mockMe = { data: undefined, isLoading: true, isError: false };
    expect(renderHook(() => useLegalConsentGate()).result.current).toBe(false);
  });

  it('true когда ни разу не соглашался', () => {
    mockMe = me(null);
    expect(renderHook(() => useLegalConsentGate()).result.current).toBe(true);
  });

  it('true когда принятая версия устарела', () => {
    mockMe = me(1); // < 2
    expect(renderHook(() => useLegalConsentGate()).result.current).toBe(true);
  });

  it('false когда принятая версия актуальна', () => {
    mockMe = me(2);
    expect(renderHook(() => useLegalConsentGate()).result.current).toBe(false);
  });
});
