import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ConfirmDialog } from './confirm-dialog';

const messages = { common: { close: 'Close', cancel: 'Cancel' } };

function renderDialog(
  props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {},
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ConfirmDialog
        open
        title="End this session?"
        description="The device will be signed out."
        confirmLabel="End"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe('ConfirmDialog', () => {
  it('показывает заголовок и описание', () => {
    renderDialog();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('End this session?')).toBeInTheDocument();
    expect(screen.getByText('The device will be signed out.')).toBeInTheDocument();
  });

  it('кнопка подтверждения вызывает onConfirm', () => {
    const onConfirm = vi.fn();
    renderDialog({ onConfirm });
    fireEvent.click(screen.getByRole('button', { name: 'End' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('«Отмена», крестик и Esc вызывают onClose, но не onConfirm', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    renderDialog({ onConfirm, onClose });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('не рендерится, когда open=false', () => {
    renderDialog({ open: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
