/**
 * Модалка ручной активации продвижения объявления (ADMIN-13).
 * Выбор тарифа (TOP/VIP) и срока (7/14/30 дней) → POST /admin/listings/:id/promotions.
 * Презентационная: мутацию владеет страница (как CreateUserModal). Стиль 1:1.
 */
'use client';

import { useState } from 'react';
import { IC } from '@/components/admin/icons';
import type { ActivatablePromotionType, PromotionPeriodDays } from '@/store/api/adminTypes';

const TIERS: ActivatablePromotionType[] = ['TOP', 'VIP'];
const PERIODS: PromotionPeriodDays[] = [7, 14, 30];

interface PromoteListingModalProps {
  onClose: () => void;
  onSubmit: (type: ActivatablePromotionType, periodDays: PromotionPeriodDays) => void;
  isSubmitting: boolean;
}

export function PromoteListingModal({ onClose, onSubmit, isSubmitting }: PromoteListingModalProps) {
  const [tier, setTier] = useState<ActivatablePromotionType>('TOP');
  const [period, setPeriod] = useState<PromotionPeriodDays>(7);
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(26,26,26,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} className="fade-up a-card" style={{ width: '100%', maxWidth: 420, padding: 26, borderRadius: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 22 }}>Продвинуть объявление</h2>
          <button className="aicon-btn" style={{ width: 32, height: 32, border: 'none' }} onClick={onClose}><IC.X size={18} /></button>
        </div>
        <div className="col gap-14">
          <div>
            <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 8 }}>Тариф</label>
            <div className="row wrap gap-8">
              {TIERS.map((t) => (
                <button key={t} onClick={() => setTier(t)} className="abtn abtn-sm" style={{ background: tier === t ? 'var(--red)' : 'var(--surface)', color: tier === t ? '#fff' : 'var(--ink)', border: tier === t ? 'none' : '1.5px solid var(--border)' }}>{t}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 8 }}>Срок</label>
            <div className="row wrap gap-8">
              {PERIODS.map((p) => (
                <button key={p} onClick={() => setPeriod(p)} className="abtn abtn-sm" style={{ background: period === p ? 'var(--red)' : 'var(--surface)', color: period === p ? '#fff' : 'var(--ink)', border: period === p ? 'none' : '1.5px solid var(--border)' }}>{p} дней</button>
              ))}
            </div>
          </div>
          <div className="row gap-10" style={{ marginTop: 6 }}>
            <button className="abtn abtn-primary" style={{ flex: 1, opacity: isSubmitting ? 0.5 : 1 }} disabled={isSubmitting} onClick={() => onSubmit(tier, period)}>{isSubmitting ? 'Активация…' : 'Активировать'}</button>
            <button className="abtn abtn-outline" onClick={onClose}>Отмена</button>
          </div>
        </div>
      </div>
    </div>
  );
}
