import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ru from '../../../messages/ru.json';

vi.mock('@/store/hooks', () => ({ useAppSelector: () => true }));
vi.mock('@/store/api/createListingApi', () => ({
  useCreateListingMutation: () => [vi.fn(), { isLoading: false }],
  useUploadListingMediaMutation: () => [vi.fn(), { isLoading: false }],
}));
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('./AddressStep', () => ({ AddressStep: () => null }));
vi.mock('@/components/layout/LoginModal', () => ({ LoginModal: () => null }));
vi.mock('next-intl', () => {
  const resolve =
    (ns: string) =>
    (key: string): string => {
      const root = (ns ? (ru as any)[ns] : ru) as any;
      const val = key
        .split('.')
        .reduce((o: any, k: string) => (o && typeof o === 'object' ? o[k] : undefined), root);
      return typeof val === 'string' ? val : key;
    };
  return { useTranslations: resolve, useLocale: () => 'ru' };
});

import { ListingNew } from './ListingNew';

describe('ListingNew wizard (variant B)', () => {
  it('прогресс-бар не содержит шаг «Контакты», но содержит «Описание» и «Превью»', () => {
    render(<ListingNew />);
    expect(screen.queryByText('Контакты')).toBeNull();
    expect(screen.getByText('Описание')).toBeInTheDocument();
    expect(screen.getByText('Превью')).toBeInTheDocument();
  });
});
