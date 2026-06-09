/**
 * Детальная пользователя (порт UserDetail из scripts/admin-pages.jsx).
 * id через useParams, user через getUserById. Форма (useState) с правкой данных
 * и роли, действия и блок/разблок → toast. Статус блокировки — локальный state.
 * Persistence между страницами не требуется. 1:1 с прототипом.
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ADMIN, getUserById, getListingsByAgent } from '@/lib/mock';
import type { Role } from '@/lib/mock';
import { UserStatusPill, StatusPill } from '@/components/admin/ui/pill';
import { IC } from '@/components/admin/icons';
import { useToast } from '@/components/admin/toast';

interface UserForm {
  name: string;
  phone: string;
  email: string;
  role: Role;
}

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const user = getUserById(id);

  const [form, setForm] = useState<UserForm>({
    name: user?.name ?? '',
    phone: user?.phone ?? '',
    email: user?.email ?? '',
    role: user?.role ?? 'User',
  });
  const [status, setStatus] = useState<'active' | 'blocked'>(user?.status ?? 'active');

  if (!user) {
    return (
      <div className="a-card" style={{ padding: 40 }}>
        Пользователь не найден.{' '}
        <Link href="/admin/users" className="abtn abtn-ghost">← Назад</Link>
      </div>
    );
  }

  const set = <K extends keyof UserForm>(k: K, v: UserForm[K]) => setForm((p) => ({ ...p, [k]: v }));
  const dirty = form.name !== user.name || form.phone !== user.phone || form.email !== (user.email || '') || form.role !== user.role;
  const myListings = getListingsByAgent(user.name).slice(0, 4);

  const onToggleStatus = () => {
    setStatus((s) => (s === 'active' ? 'blocked' : 'active'));
    toast('Статус обновлён');
  };

  return (
    <div className="fade-up">
      <Link href="/admin/users" className="abtn abtn-ghost abtn-sm" style={{ marginBottom: 14, paddingLeft: 0 }}><IC.ChevronLeft size={17} /> Все пользователи</Link>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }} className="dash-row">
        <div className="col gap-20">
          <div className="a-card" style={{ padding: 24 }}>
            <div className="row gap-16" style={{ flexWrap: 'wrap' }}>
              <span style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--teal)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 800, flexShrink: 0 }}>{user.name[0]}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row gap-10" style={{ flexWrap: 'wrap' }}><h2 style={{ fontSize: 23 }}>{user.name}</h2><UserStatusPill status={status} />{user.verified && <span className="a-pill" style={{ background: 'var(--mint)', color: 'var(--teal-deep)' }}>✓ Проверен</span>}</div>
                <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>ID: {user.id} · {ADMIN.ROLE_LABEL[user.role]} · регистрация {user.joined}</div>
              </div>
            </div>
          </div>
          <div className="a-card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 17, marginBottom: 16 }}>Данные и роль</h3>
            <div className="col gap-16">
              <div className="row gap-12" style={{ flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}><label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 6 }}>Имя</label><input className="a-field" style={{ width: '100%' }} value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
                <div style={{ flex: 1, minWidth: 200 }}><label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 6 }}>Телефон</label><input className="a-field" style={{ width: '100%' }} value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
              </div>
              <div><label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 6 }}>Email</label><input className="a-field" style={{ width: '100%' }} value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 8 }}>Роль</label>
                <div className="row wrap gap-8">
                  {ADMIN.ROLES.map((r) => (
                    <button key={r} onClick={() => set('role', r)} className="abtn abtn-sm" style={{ background: form.role === r ? 'var(--red)' : 'var(--surface)', color: form.role === r ? '#fff' : 'var(--ink)', border: form.role === r ? 'none' : '1.5px solid var(--border)' }}>{ADMIN.ROLE_LABEL[r]}</button>
                  ))}
                </div>
                <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>Роль определяет права: публикация объявлений, работа с агентством, доступ к лидам.</p>
              </div>
              <div className="row gap-10" style={{ marginTop: 4 }}>
                <button className="abtn abtn-primary" style={{ opacity: dirty ? 1 : 0.5 }} disabled={!dirty} onClick={() => { toast('Изменения сохранены'); }}>Сохранить</button>
                <button className="abtn abtn-outline" disabled={!dirty} onClick={() => setForm({ name: user.name, phone: user.phone, email: user.email || '', role: user.role })}>Отменить</button>
              </div>
            </div>
          </div>
          <div className="a-card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 17, marginBottom: 12 }}>Объявления пользователя <span className="muted" style={{ fontWeight: 600 }}>· {user.listings}</span></h3>
            {myListings.length === 0
              ? <p className="muted" style={{ fontSize: 14 }}>У пользователя нет активных объявлений.</p>
              : <div className="col gap-10">{myListings.map((l) => (
                  <div key={l.id} className="row gap-12" style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                    <div style={{ width: 52, height: 40, borderRadius: 7, overflow: 'hidden', flexShrink: 0 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={l.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.title}</div><div className="muted" style={{ fontSize: 12 }}>{l.price} · {l.district}</div></div>
                    <StatusPill status={l.status} />
                  </div>
                ))}</div>}
          </div>
        </div>
        <div className="a-card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 15, marginBottom: 14 }}>Действия</h3>
          <div className="col gap-10">
            <button className="abtn abtn-outline" style={{ width: '100%' }} onClick={() => toast('Ссылка для сброса пароля отправлена')}>Сбросить пароль</button>
            <button className="abtn abtn-outline" style={{ width: '100%' }} onClick={() => toast('Письмо с подтверждением отправлено')}>Отправить подтверждение</button>
            <button className="abtn" style={{ width: '100%', background: status === 'active' ? 'var(--red-bg)' : 'var(--green-bg)', color: status === 'active' ? 'var(--red)' : 'var(--green)' }} onClick={onToggleStatus}>
              {status === 'active' ? 'Заблокировать' : 'Разблокировать'}
            </button>
            <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
            <button className="abtn abtn-danger" style={{ width: '100%' }} onClick={() => toast('Удаление аккаунта требует подтверждения')}>Удалить аккаунт</button>
          </div>
        </div>
      </div>
    </div>
  );
}
