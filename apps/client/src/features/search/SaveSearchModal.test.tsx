import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { SaveSearchModal } from './SaveSearchModal';

const messages = {
  saveSearchModal: {
    titleCreate: 'Save search',
    titleRename: 'Rename search',
    nameLabel: 'Name your search',
    namePlaceholder: 'e.g. ...',
    submitCreate: 'Save',
    submitRename: 'Save',
    cancel: 'Cancel',
    close: 'Close',
  },
};

function renderModal(props: Partial<React.ComponentProps<typeof SaveSearchModal>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SaveSearchModal
        open
        mode="create"
        initialName="My search"
        onSubmit={vi.fn()}
        onClose={vi.fn()}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe('SaveSearchModal', () => {
  it('префилл именем и submit передаёт (возможно отредактированное) имя', async () => {
    const onSubmit = vi.fn();
    renderModal({ onSubmit });
    const input = screen.getByLabelText('Name your search') as HTMLInputElement;
    expect(input.value).toBe('My search');
    fireEvent.change(input, { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Renamed'));
  });

  it('пустое имя блокирует submit', () => {
    const onSubmit = vi.fn();
    renderModal({ initialName: '', onSubmit });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
