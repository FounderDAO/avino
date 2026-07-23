import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { LimitReachedModal } from './LimitReachedModal';

const messages = {
  listingNew: {
    limitModal: {
      title: 'Listing limit reached',
      body: 'Individuals can list up to {limit} active listings. Become an agent.',
      bodyNoLimit:
        "You've reached your active listings limit. Become an agent.",
      becomeAgent: 'Become an agent',
      dismiss: 'Got it',
      close: 'Close',
    },
  },
};

let mockSettings: { activeListingLimit: number } | undefined = {
  activeListingLimit: 3,
};
const push = vi.fn();

beforeEach(() => {
  mockSettings = { activeListingLimit: 3 };
  push.mockClear();
});

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push, back: vi.fn() }),
}));
vi.mock('@/store/api/publicSettingsApi', () => ({
  useGetPublicSettingsQuery: () => ({
    data: mockSettings,
    isLoading: !mockSettings,
  }),
}));

function renderModal(
  props: Partial<React.ComponentProps<typeof LimitReachedModal>> = {},
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LimitReachedModal open onClose={vi.fn()} {...props} />
    </NextIntlClientProvider>,
  );
}

describe('LimitReachedModal', () => {
  it('подставляет лимит из publicSettings в текст', () => {
    renderModal();
    expect(screen.getByText(/up to 3 active listings/)).toBeInTheDocument();
  });

  it('без данных publicSettings показывает текст без числа', () => {
    mockSettings = undefined;
    renderModal();
    expect(
      screen.getByText(
        "You've reached your active listings limit. Become an agent.",
      ),
    ).toBeInTheDocument();
  });

  it('CTA «Стать агентом» ведёт на /become-agent и закрывает модалку', () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    fireEvent.click(screen.getByRole('button', { name: 'Become an agent' }));
    expect(push).toHaveBeenCalledWith('/become-agent');
    expect(onClose).toHaveBeenCalled();
  });

  it('не рендерится, когда open=false', () => {
    renderModal({ open: false });
    expect(screen.queryByText('Listing limit reached')).toBeNull();
  });
});
