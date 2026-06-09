/**
 * Модалка создания пользователя (порт CreateUserModal из scripts/admin-pages.jsx).
 * Форма с валидацией (имя > 1 символа, телефон >= 9 цифр), чипы ролей,
 * клик по фону закрывает. 1:1 с прототипом.
 */
'use client';

import { useState } from 'react';
import { ADMIN } from '@/lib/mock';
import type { Role } from '@/lib/mock';
import { IC } from '@/components/admin/icons';

export interface CreateUserForm {
  name: string;
  phone: string;
  email: string;
  role: Role;
}

interface CreateUserModalProps {
  onClose: () => void;
  onCreate: (form: CreateUserForm) => void;
}

export function CreateUserModal({ onClose, onCreate }: CreateUserModalProps) {
  const [form, setForm] = useState<CreateUserForm>({ name: '', phone: '', email: '', role: 'User' });
  const set = <K extends keyof CreateUserForm>(k: K, v: CreateUserForm[K]) => setForm((p) => ({ ...p, [k]: v }));
  const valid = form.name.trim().length > 1 && form.phone.replace(/\D/g, '').length >= 9;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(26,26,26,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} className="fade-up a-card" style={{ width: '100%', maxWidth: 460, padding: 26, borderRadius: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 22 }}>Новый пользователь</h2>
          <button className="aicon-btn" style={{ width: 32, height: 32, border: 'none' }} onClick={onClose}><IC.X size={18} /></button>
        </div>
        <div className="col gap-14">
          <div><label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 6 }}>Имя *</label><input className="a-field" style={{ width: '100%' }} placeholder="Имя и фамилия" value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus /></div>
          <div className="row gap-12">
            <div style={{ flex: 1 }}><label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 6 }}>Телефон *</label><input className="a-field" style={{ width: '100%' }} placeholder="+998 90 …" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
            <div style={{ flex: 1 }}><label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 6 }}>Email</label><input className="a-field" style={{ width: '100%' }} placeholder="mail@avino.uz" value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 8 }}>Роль</label>
            <div className="row wrap gap-8">
              {ADMIN.ROLES.map((r) => (
                <button key={r} onClick={() => set('role', r)} className="abtn abtn-sm" style={{ background: form.role === r ? 'var(--red)' : 'var(--surface)', color: form.role === r ? '#fff' : 'var(--ink)', border: form.role === r ? 'none' : '1.5px solid var(--border)' }}>{ADMIN.ROLE_LABEL[r]}</button>
              ))}
            </div>
          </div>
          <div className="row gap-10" style={{ marginTop: 6 }}>
            <button className="abtn abtn-primary" style={{ flex: 1, opacity: valid ? 1 : 0.5 }} disabled={!valid} onClick={() => onCreate(form)}>Создать</button>
            <button className="abtn abtn-outline" onClick={onClose}>Отмена</button>
          </div>
        </div>
      </div>
    </div>
  );
}
