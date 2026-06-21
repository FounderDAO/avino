/**
 * usePromotionsEnabled — unit-тесты хука (3 кейса):
 *  1. false пока грузится (isLoading=true)
 *  2. false при ошибке сети (isError=true)
 *  3. true когда сервер вернул promotionsEnabled: true
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

// Состояние мока управляется переменной перед каждым тестом.
let mockQueryResult = { data: undefined as { promotionsEnabled: boolean } | undefined, isLoading: false, isError: false };

vi.mock('@/store/api/publicSettingsApi', () => ({
  useGetPublicSettingsQuery: () => mockQueryResult,
}));

import { usePromotionsEnabled } from './usePromotionsEnabled';

describe('usePromotionsEnabled', () => {
  it('возвращает false пока идёт загрузка', () => {
    mockQueryResult = { data: undefined, isLoading: true, isError: false };
    const { result } = renderHook(() => usePromotionsEnabled());
    expect(result.current).toBe(false);
  });

  it('возвращает false при ошибке запроса', () => {
    mockQueryResult = { data: undefined, isLoading: false, isError: true };
    const { result } = renderHook(() => usePromotionsEnabled());
    expect(result.current).toBe(false);
  });

  it('возвращает true когда сервер включил промо', () => {
    mockQueryResult = { data: { promotionsEnabled: true }, isLoading: false, isError: false };
    const { result } = renderHook(() => usePromotionsEnabled());
    expect(result.current).toBe(true);
  });
});
