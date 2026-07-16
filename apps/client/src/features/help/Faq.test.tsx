/**
 * Faq — поиск по справочному центру.
 *
 * Регрессия «поиск на странице help ничего не находит» (UZ-локаль): пользователь
 * вводит «elon qanday joylash mumkin», а список отвечал «ничего не найдено».
 * Две причины: (1) в узбекском тексте слово с апострофом — «e'lon», а вводят
 * «elon»; (2) старый поиск искал всю фразу как подстроку, а не по словам.
 *
 * next-intl замокан резолвером по реальному messages/uz.json (как в Hero.test).
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next-intl', async () => {
  const uz = (await import('../../../messages/uz.json')).default as Record<
    string,
    unknown
  >;
  const useTranslations =
    (ns: string) =>
    (key: string, vars?: Record<string, unknown>): string => {
      const root = (ns ? uz[ns] : uz) as Record<string, unknown>;
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
  return { useTranslations, useLocale: () => 'uz' };
});

import { Faq } from './Faq';

const POST = "E'lonni qanday joylayman?";
const EMPTY = /hech narsa topilmadi/i;

describe('Faq search (uz)', () => {
  it('фраза без апострофа находит вопрос про размещение', async () => {
    const user = userEvent.setup();
    render(<Faq />);

    const input = screen.getByPlaceholderText(/masalan/i);
    await user.type(input, 'elon qanday joylash mumkin');

    expect(screen.getByText(POST)).toBeTruthy();
    expect(screen.queryByText(EMPTY)).toBeNull();
  });

  it('одно слово «elon» матчит текст с апострофом «e\'lon»', async () => {
    const user = userEvent.setup();
    render(<Faq />);

    await user.type(screen.getByPlaceholderText(/masalan/i), 'elon');

    expect(screen.getByText(POST)).toBeTruthy();
    expect(screen.queryByText(EMPTY)).toBeNull();
  });

  it('бессмысленный запрос показывает «ничего не найдено»', async () => {
    const user = userEvent.setup();
    render(<Faq />);

    await user.type(screen.getByPlaceholderText(/masalan/i), 'zzzqqq');

    expect(screen.queryByText(POST)).toBeNull();
    expect(screen.getByText(EMPTY)).toBeTruthy();
  });
});
