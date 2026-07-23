/**
 * Модалка причины блокировки/удаления аккаунта в /admin/users/[id].
 * Заменяет window.prompt: обязательная причина (textarea) + предупреждение
 * о последствиях действия. Мутацию владеет страница (как CreateUserModal).
 */
'use client';

import { useState } from 'react';
import { IC } from '@/components/admin/icons';

type ReasonModalTarget = 'BLOCKED' | 'DELETED';

const CONFIG: Record<ReasonModalTarget, { title: string; warning: string; confirmLabel: string }> = {
  BLOCKED: {
    title: 'Заблокировать пользователя',
    warning: 'Активные сессии будут завершены, объявления скроются с публикации.',
    confirmLabel: 'Заблокировать',
  },
  DELETED: {
    title: 'Удалить аккаунт',
    warning: 'Действие необратимо: объявления будут удалены, пользователь разлогинится.',
    confirmLabel: 'Удалить аккаунт',
  },
};

interface UserStatusReasonModalProps {
  target: ReasonModalTarget;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  isSubmitting: boolean;
}

export function UserStatusReasonModal({ target, onClose, onConfirm, isSubmitting }: UserStatusReasonModalProps) {
  const [reason, setReason] = useState('');
  const { title, warning, confirmLabel } = CONFIG[target];
  const valid = reason.trim().length > 0;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(26,26,26,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} className="fade-up a-card" style={{ width: '100%', maxWidth: 440, padding: 26, borderRadius: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 22 }}>{title}</h2>
          <button className="aicon-btn" style={{ width: 32, height: 32, border: 'none' }} onClick={onClose}><IC.X size={18} /></button>
        </div>
        <div className="col gap-14">
          <div className="row gap-8" style={{ background: 'var(--red-bg)', color: 'var(--red)', borderRadius: 10, padding: '10px 13px', fontSize: 13.5, fontWeight: 600, alignItems: 'flex-start' }}>
            <IC.Alert size={16} style={{ flexShrink: 0, marginTop: 1 }} /> {warning}
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 6 }}>Причина *</label>
            <textarea
              className="a-field"
              style={{ width: '100%', minHeight: 84, resize: 'vertical' }}
              placeholder="Укажите причину действия"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
          </div>
          <div className="row gap-10" style={{ marginTop: 6 }}>
            <button className="abtn abtn-danger" style={{ flex: 1, opacity: valid && !isSubmitting ? 1 : 0.5 }} disabled={!valid || isSubmitting} onClick={() => onConfirm(reason.trim())}>
              {isSubmitting ? 'Подождите…' : confirmLabel}
            </button>
            <button className="abtn abtn-outline" onClick={onClose} disabled={isSubmitting}>Отмена</button>
          </div>
        </div>
      </div>
    </div>
  );
}
