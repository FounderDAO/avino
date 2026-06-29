import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

let mockShow = false;
vi.mock('@/lib/useLegalConsentGate', () => ({ useLegalConsentGate: () => mockShow }));
vi.mock('@/components/layout/LegalConsentModal', () => ({
  LegalConsentModal: () => <div data-testid="legal-modal" />,
}));

import { LegalConsentGate } from './LegalConsentGate';

describe('LegalConsentGate', () => {
  beforeEach(() => {
    mockShow = false;
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
});
