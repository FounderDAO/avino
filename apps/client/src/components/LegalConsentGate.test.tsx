import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

let mockShow = false;
let mockPathname = '/';
vi.mock('@/lib/useLegalConsentGate', () => ({ useLegalConsentGate: () => mockShow }));
vi.mock('@/i18n/navigation', () => ({ usePathname: () => mockPathname }));
vi.mock('@/components/layout/LegalConsentModal', () => ({
  LegalConsentModal: () => <div data-testid="legal-modal" />,
}));

import { LegalConsentGate } from './LegalConsentGate';

describe('LegalConsentGate', () => {
  beforeEach(() => {
    mockShow = false;
    mockPathname = '/';
  });

  it('ничего не рендерит, когда согласие не требуется', () => {
    render(<LegalConsentGate />);
    expect(screen.queryByTestId('legal-modal')).toBeNull();
  });

  it('рендерит модалку, когда согласие требуется', () => {
    mockShow = true;
    render(<LegalConsentGate />);
    expect(screen.getByTestId('legal-modal')).toBeInTheDocument();
  });

  it('не показывает модалку на юридических страницах, даже если согласие требуется', () => {
    mockShow = true;
    for (const path of ['/legal', '/legal/terms', '/legal/privacy']) {
      mockPathname = path;
      const { unmount } = render(<LegalConsentGate />);
      expect(screen.queryByTestId('legal-modal')).toBeNull();
      unmount();
    }
  });
});
