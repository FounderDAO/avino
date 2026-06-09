/**
 * Список пользователей (порт Users из scripts/admin-pages.jsx).
 * Локальный state: users (init из ADMIN.users), q (поиск), showCreate (модалка).
 * createUser добавляет в state + toast + переход на детальную. toggleStatus
 * переключает статус локально + toast. 1:1 с прототипом.
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ADMIN } from '@/lib/mock';
import type { AdminUser } from '@/lib/mock';
import { SectionTitle } from '@/components/admin/ui/section-title';
import { UserStatusPill } from '@/components/admin/ui/pill';
import { IC } from '@/components/admin/icons';
import { useToast } from '@/components/admin/toast';
import { CreateUserModal, type CreateUserForm } from '@/components/admin/CreateUserModal';

export default function UsersPage() {
  const router = useRouter();
  const toast = useToast();
  const [users, setUsers] = useState<AdminUser[]>(ADMIN.users);
  const [q, setQ] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const rows = users.filter((u) => !q || (u.name + u.phone + (u.email || '')).toLowerCase().includes(q.toLowerCase()));

  const onOpen = (id: string) => router.push('/admin/users/' + id);

  const onToggleStatus = (id: string) => {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, status: u.status === 'active' ? 'blocked' : 'active' } : u)));
    toast('Статус обновлён');
  };

  const createUser = (form: CreateUserForm) => {
    const id = 'u' + Date.now();
    const joined = new Date().toLocaleDateString('ru-RU');
    const user: AdminUser = { id, ...form, listings: 0, status: 'active', joined, verified: false };
    setUsers((prev) => [user, ...prev]);
    setShowCreate(false);
    toast('Пользователь создан');
    router.push('/admin/users/' + id);
  };

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <SectionTitle sub={`${users.length} пользователей`}>Пользователи</SectionTitle>
        <button className="abtn abtn-primary" onClick={() => setShowCreate(true)}><IC.Plus size={17} /> Добавить пользователя</button>
      </div>
      <div style={{ position: 'relative', maxWidth: 320, marginBottom: 14 }}>
        <IC.Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
        <input className="a-field" style={{ paddingLeft: 36, width: '100%' }} placeholder="Поиск по имени, телефону…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="a-card table-scroll">
        <table className="a-table">
          <thead><tr><th>Имя</th><th>Телефон</th><th>Роль</th><th>Объявл.</th><th>Статус</th><th>Регистрация</th><th></th></tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} style={{ cursor: 'pointer' }} onClick={() => onOpen(u.id)}>
                <td><div className="row gap-10"><span style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--mint)', color: 'var(--teal-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>{u.name[0]}</span><div><b>{u.name}</b><div className="muted" style={{ fontSize: 12 }}>{u.email}</div></div></div></td>
                <td className="muted" style={{ whiteSpace: 'nowrap' }}>{u.phone}</td>
                <td>{ADMIN.ROLE_LABEL[u.role] || u.role}</td>
                <td>{u.listings}</td>
                <td><UserStatusPill status={u.status} /></td>
                <td className="muted">{u.joined}</td>
                <td onClick={(e) => e.stopPropagation()}><div className="row gap-6">
                  <button className="abtn abtn-outline abtn-sm" onClick={() => onOpen(u.id)}>Открыть</button>
                  <button className="abtn abtn-ghost abtn-sm" onClick={() => onToggleStatus(u.id)} style={{ color: u.status === 'active' ? 'var(--red)' : 'var(--green)' }}>{u.status === 'active' ? 'Блок' : 'Разблок.'}</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} onCreate={createUser} />}
    </div>
  );
}
