/**
 * Общая модалка подтверждения действия в админке — замена window.confirm.
 * Оверлей + карточка по центру (как UserStatusReasonModal). Действием владеет
 * страница: модалка лишь сообщает о подтверждении/отмене. Пока isSubmitting,
 * закрыть её нельзя (ни Esc, ни кликом по оверлею).
 */
'use client';

import { useEffect, type ReactNode } from 'react';
import { IC } from '@/components/admin/icons';

interface ConfirmModalProps {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** danger — необратимые/разрушающие действия, primary — обычные. */
  tone?: 'danger' | 'primary';
  isSubmitting?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmModal({ title, message, confirmLabel, cancelLabel = 'Отмена', tone = 'primary', isSubmitting = false, onConfirm, onClose }: ConfirmModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isSubmitting, onClose]);

  const close = () => {
    if (!isSubmitting) onClose();
  };

  return (
    <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(26,26,26,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} className="fade-up a-card" style={{ width: '100%', maxWidth: 440, padding: 26, borderRadius: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontSize: 22 }}>{title}</h2>
          <button className="aicon-btn" style={{ width: 32, height: 32, border: 'none' }} aria-label="Закрыть" disabled={isSubmitting} onClick={close}><IC.X size={18} /></button>
        </div>
        <p style={{ fontSize: 14.5, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 20 }}>{message}</p>
        <div className="row gap-10">
          <button className={`abtn ${tone === 'danger' ? 'abtn-danger' : 'abtn-primary'}`} style={{ flex: 1, opacity: isSubmitting ? 0.5 : 1 }} disabled={isSubmitting} onClick={onConfirm}>
            {isSubmitting ? 'Подождите…' : confirmLabel}
          </button>
          <button className="abtn abtn-outline" onClick={close} disabled={isSubmitting} autoFocus>{cancelLabel}</button>
        </div>
      </div>
    </div>
  );
}
