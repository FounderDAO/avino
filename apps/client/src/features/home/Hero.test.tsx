/**
 * Hero — поисковая панель главной (Купить/Снять + локация-автокомплит + тип).
 *
 * Регрессия бага «фильтр с главной ничего не находит»: раньше любой ввод локации
 * уходил в ?query= → бэкенд-`q` (ILIKE по title/description/address), и название
 * района/города не матчилось. Теперь выбор района-подсказки ведёт на рабочий
 * фильтр ?district_id=, а свободный текст — на ?query= (fallback).
 *
 * useGeoSuggest замокан (без Yandex SDK), useRouter/useTranslations — резолверы.
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { District } from '@/lib/mock/types';

const push = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element -- тестовая заглушка
  default: ({ alt }: { alt?: string }) => <img alt={alt ?? ''} />,
}));

// next-intl резолвер по реальному messages/ru.json (как в LoginModal.test).
vi.mock('next-intl', async () => {
  const ru = (await import('../../../messages/ru.json')).default as Record<
    string,
    unknown
  >;
  const useTranslations =
    (ns: string) =>
    (key: string, vars?: Record<string, unknown>): string => {
      const root = (ns ? ru[ns] : ru) as Record<string, unknown>;
      const val = key
        .split('.')
        .reduce<unknown>(
          (o, k) =>
            o && typeof o === 'object'
              ? (o as Record<string, unknown>)[k]
              : undefined,
          root,
        );
      return typeof val === 'string'
        ? vars
          ? val.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))
          : val
        : key;
    };
  return { useTranslations, useLocale: () => 'ru' };
});

// useGeoSuggest: при вводе ≥2 символов отдаём один район-подсказку (без Yandex).
vi.mock('@/features/search/useGeoSuggest', () => ({
  useGeoSuggest: (query: string) => ({
    items:
      query.trim().length >= 2
        ? [
            {
              kind: 'district',
              title: 'Юнусабадский',
              value: 'Ташкент, Юнусабадский',
              districtId: 'yuna-id',
            },
          ]
        : [],
    loading: false,
  }),
}));

import { Hero } from './Hero';

const districts: District[] = [{ id: 'yuna-id', name: 'Юнусабадский' }];

function parsePush(): URLSearchParams {
  const url = String(push.mock.calls[0][0]);
  return new URLSearchParams(url.split('?')[1] ?? '');
}

beforeEach(() => push.mockReset());

describe('Hero search panel', () => {
  it('выбор района-подсказки → переход на ?district_id= (рабочий фильтр)', async () => {
    const user = userEvent.setup();
    render(<Hero districts={districts} />);

    await user.click(screen.getByRole('combobox', { name: 'Локация' }));
    await user.keyboard('Юну');
    await user.click(screen.getByText('Юнусабадский'));
    await user.click(screen.getByRole('button', { name: /Найти/i }));

    expect(push).toHaveBeenCalledTimes(1);
    const qs = parsePush();
    expect(qs.get('tx')).toBe('SALE');
    expect(qs.get('district_id')).toBe('yuna-id');
    expect(qs.get('query')).toBeNull();
  });

  it('свободный текст (без выбора) → переход на ?query= (fallback)', async () => {
    const user = userEvent.setup();
    render(<Hero districts={districts} />);

    await user.click(screen.getByRole('combobox', { name: 'Локация' }));
    await user.keyboard('Амира Темура');
    await user.click(screen.getByRole('button', { name: /Найти/i }));

    expect(push).toHaveBeenCalledTimes(1);
    const qs = parsePush();
    expect(qs.get('tx')).toBe('SALE');
    expect(qs.get('query')).toBe('Амира Темура');
    expect(qs.get('district_id')).toBeNull();
  });
});
