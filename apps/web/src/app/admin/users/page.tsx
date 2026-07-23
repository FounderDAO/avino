/**
 * Список пользователей — реальный API (RTK Query). Фильтр по статусу/роли, поиск
 * (q, debounce), серверная пагинация. Клик по строке → /admin/users/{id}.
 * Вёрстка 1:1 с прототипом; данные — GET /admin/users (+ /roles для фильтра).
 *
 * Кнопка «Добавить пользователя» / CreateUserModal — оставлены на моке
 * (бэкенда POST /admin/users нет): создание лишь тостит и ведёт на форму.
 */
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SectionTitle } from '@/components/admin/ui/section-title';
import { AuthTypePill, UserStatusPill } from '@/components/admin/ui/pill';
import { IC } from '@/components/admin/icons';
import { useToast } from '@/components/admin/toast';
import { CreateUserModal, type CreateUserForm } from '@/components/admin/CreateUserModal';
import {
  useGetRolesQuery,
  useListAdminUsersQuery,
} from '@/store/api/adminUsersApi';
import { totalPages } from '@/store/api/adminApi';
import type { RoleCode } from '@/store/api/adminTypes';
import type { UserStatus } from '@/store/api/authApi';
import { roleLabel, rowToAdminUser } from '@/lib/adapters/users';

const LIMIT = 20;

const statusFilters: [string, string][] = [
  ['ALL', 'Все'],
  ['ACTIVE', 'Активные'],
  ['BLOCKED', 'Заблокированные'],
  ['DELETED', 'Удалённые'],
];

export default function UsersPage() {
  const router = useRouter();
  const toast = useToast();
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  // Дебаунс поиска (400мс), чтобы не дёргать API на каждый символ.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 400);
    return () => clearTimeout(t);
  }, [q]);

  // Смена фильтра/запроса — на первую страницу.
  useEffect(() => {
    setPage(1);
  }, [statusFilter, roleFilter, debouncedQ]);

  const { data: roles } = useGetRolesQuery();

  const { data, isLoading, isFetching, isError, refetch } = useListAdminUsersQuery({
    status: statusFilter === 'ALL' ? undefined : (statusFilter as UserStatus),
    role: roleFilter === 'ALL' ? undefined : (roleFilter as RoleCode),
    q: debouncedQ.trim() || undefined,
    page,
    limit: LIMIT,
  });

  const rows = (data?.data ?? []).map(rowToAdminUser);
  const total = data?.meta.total ?? 0;
  const pages = totalPages(data?.meta);

  const onOpen = (id: string) => router.push('/admin/users/' + id);

  const createUser = (_form: CreateUserForm) => {
    // POST /admin/users отсутствует на бэкенде → мок: тост + закрытие.
    setShowCreate(false);
    toast('Пользователь создан');
  };

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <SectionTitle sub={`${total} пользователей`}>Пользователи</SectionTitle>
        <button className="abtn abtn-primary" onClick={() => setShowCreate(true)}><IC.Plus size={17} /> Добавить пользователя</button>
      </div>
      <div className="row gap-8" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', minWidth: 240 }}>
          <IC.Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input className="a-field" style={{ paddingLeft: 36, width: '100%' }} placeholder="Поиск по имени, телефону…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {statusFilters.map(([k, v]) => (
          <button key={k} onClick={() => setStatusFilter(k)} className="abtn abtn-sm" style={{ background: statusFilter === k ? 'var(--ink)' : 'var(--surface)', color: statusFilter === k ? '#fff' : 'var(--ink)', border: statusFilter === k ? 'none' : '1.5px solid var(--border)' }}>{v}</button>
        ))}
        <select className="a-field" style={{ minWidth: 160 }} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="ALL">Все роли</option>
          {(roles ?? []).map((r) => (
            <option key={r.code} value={r.code}>{roleLabel(r.code)}</option>
          ))}
        </select>
      </div>
      {isError ? (
        <div className="a-card" style={{ padding: 40, textAlign: 'center' }}>
          <p className="muted" style={{ marginBottom: 14 }}>Не удалось загрузить пользователей.</p>
          <button className="abtn abtn-outline" onClick={() => refetch()}>Повторить</button>
        </div>
      ) : (
        <div className="a-card table-scroll">
          <table className="a-table">
            <thead><tr><th>Имя</th><th>Телефон</th><th>Роль</th><th>Вход</th><th>Объявл.</th><th>Статус</th><th>Регистрация</th><th></th></tr></thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 40 }}>Загрузка…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 40 }}>Ничего не найдено.</td></tr>
              ) : (
                rows.map((u) => (
                  <tr key={u.id} style={{ cursor: 'pointer' }} onClick={() => onOpen(u.id)}>
                    <td><div className="row gap-10"><span style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--mint)', color: 'var(--teal-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>{u.name[0]}</span><div><b>{u.name}</b><div className="muted" style={{ fontSize: 12 }}>{u.email}</div></div></div></td>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>{u.phone}</td>
                    <td>{roleLabel(u.role)}</td>
                    <td><AuthTypePill authType={u.authType} /></td>
                    <td>{u.listings}</td>
                    <td><UserStatusPill status={u.status} /></td>
                    <td className="muted">{u.joined}</td>
                    <td onClick={(e) => e.stopPropagation()}><div className="row gap-6">
                      <button className="abtn abtn-outline abtn-sm" onClick={() => onOpen(u.id)}>Открыть</button>
                    </div></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 14, fontSize: 13.5, color: 'var(--muted)' }}>
        <span>{isFetching ? 'Обновление…' : `Показано ${rows.length} из ${total}`}</span>
        <div className="row gap-4">
          <button className="aicon-btn" style={{ width: 32, height: 32 }} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><IC.ChevronLeft size={16} /></button>
          <button className="abtn abtn-sm" style={{ background: 'var(--ink)', color: '#fff' }}>{page}</button>
          <button className="aicon-btn" style={{ width: 32, height: 32 }} disabled={pages > 0 && page >= pages} onClick={() => setPage((p) => p + 1)}><IC.ChevronRight size={16} /></button>
        </div>
      </div>
      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} onCreate={createUser} />}
    </div>
  );
}
