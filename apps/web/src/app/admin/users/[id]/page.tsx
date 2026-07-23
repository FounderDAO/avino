/**
 * Детальная пользователя — реальный API (RTK Query). Карточка через
 * useGetAdminUserQuery + адаптер. Действия: смена статуса (PATCH /admin/users/:id,
 * reason обязателен для BLOCKED/DELETED — клиентская валидация), назначение/снятие
 * ролей (POST/DELETE /admin/users/:id/roles, выбор из /roles). Вёрстка 1:1 с
 * прототипом.
 *
 * Поля «Данные» (имя/телефон/email) бэкенд по этому контракту не редактирует
 * (PATCH меняет только статус) → показываем read-only. Секция «Объявления
 * пользователя» — API «листинги пользователя» нет → пусто/«—».
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { UserStatusPill } from '@/components/admin/ui/pill';
import { IC } from '@/components/admin/icons';
import { useToast } from '@/components/admin/toast';
import { UserStatusReasonModal } from '@/components/admin/UserStatusReasonModal';
import {
  useAssignAdminUserRoleMutation,
  useGetAdminUserQuery,
  useGetRolesQuery,
  useRemoveAdminUserRoleMutation,
  useUpdateAdminUserStatusMutation,
} from '@/store/api/adminUsersApi';
import type { RoleCode } from '@/store/api/adminTypes';
import type { UserStatus } from '@/store/api/authApi';
import { getApiErrorCode } from '@/store/api/apiError';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import type { SerializedError } from '@reduxjs/toolkit';
import { detailToAdminUser, roleLabel } from '@/lib/adapters/users';

/** Человекочитаемый текст по коду ошибки ролей API. */
function roleErrorText(code: string | null): string {
  switch (code) {
    case 'ROLE_ALREADY_GRANTED':
      return 'Роль уже назначена';
    case 'VALIDATION_ERROR':
      return 'Недопустимая роль';
    case 'NOT_FOUND':
      return 'Пользователь или роль не найдены';
    default:
      return 'Не удалось изменить роли';
  }
}

/** Человекочитаемый текст по коду ошибки смены статуса API. */
function statusErrorText(code: string | null): string {
  switch (code) {
    case 'CONTACT_TAKEN':
      return 'Телефон или e-mail уже принадлежит другому активному аккаунту';
    case 'NOT_FOUND':
      return 'Пользователь не найден';
    default:
      return 'Не удалось обновить статус';
  }
}

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [reasonModalTarget, setReasonModalTarget] = useState<'BLOCKED' | 'DELETED' | null>(null);

  const { data, isLoading, isError, refetch } = useGetAdminUserQuery(id);
  const { data: roles } = useGetRolesQuery();
  const [updateStatus, { isLoading: statusBusy }] = useUpdateAdminUserStatusMutation();
  const [assignRole, { isLoading: assignBusy }] = useAssignAdminUserRoleMutation();
  const [removeRole, { isLoading: removeBusy }] = useRemoveAdminUserRoleMutation();
  const rolesBusy = assignBusy || removeBusy;

  if (isLoading) {
    return <div className="a-card muted" style={{ padding: 40 }}>Загрузка…</div>;
  }

  if (isError || !data) {
    return (
      <div className="a-card" style={{ padding: 40 }}>
        Пользователь не найден.{' '}
        <button className="abtn abtn-outline abtn-sm" onClick={() => refetch()}>Повторить</button>{' '}
        <Link href="/admin/users" className="abtn abtn-ghost">← Назад</Link>
      </div>
    );
  }

  const user = detailToAdminUser(data);
  const userRoles = new Set(user.roles);

  const changeStatus = async (status: UserStatus, reason: string | null = null) => {
    try {
      await updateStatus({ id, body: { status, reason } }).unwrap();
      toast('Статус обновлён');
    } catch (err) {
      toast(statusErrorText(getApiErrorCode(err as FetchBaseQueryError | SerializedError)));
    }
  };

  const confirmReasonModal = async (reason: string) => {
    if (!reasonModalTarget) return;
    await changeStatus(reasonModalTarget, reason);
    setReasonModalTarget(null);
  };

  const toggleRole = async (role: RoleCode) => {
    try {
      if (userRoles.has(role)) {
        await removeRole({ id, role }).unwrap();
        toast('Роль снята');
      } else {
        await assignRole({ id, body: { role } }).unwrap();
        toast('Роль назначена');
      }
    } catch (err) {
      toast(roleErrorText(getApiErrorCode(err as FetchBaseQueryError | SerializedError)));
    }
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
                <div className="row gap-10" style={{ flexWrap: 'wrap' }}><h2 style={{ fontSize: 23 }}>{user.name}</h2><UserStatusPill status={user.status} />{user.verified && <span className="a-pill" style={{ background: 'var(--mint)', color: 'var(--teal-deep)' }}>✓ Проверен</span>}</div>
                <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>ID: {user.id} · {roleLabel(user.role)} · регистрация {user.joined}</div>
              </div>
            </div>
          </div>
          <div className="a-card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 17, marginBottom: 16 }}>Данные и роли</h3>
            <div className="col gap-16">
              <div className="row gap-12" style={{ flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}><label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 6 }}>Имя</label><input className="a-field" style={{ width: '100%' }} value={user.name} readOnly /></div>
                <div style={{ flex: 1, minWidth: 200 }}><label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 6 }}>Телефон</label><input className="a-field" style={{ width: '100%' }} value={user.phone} readOnly /></div>
              </div>
              <div><label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 6 }}>Email</label><input className="a-field" style={{ width: '100%' }} value={user.email} readOnly /></div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 8 }}>Роли</label>
                <div className="row wrap gap-8">
                  {(roles ?? []).map((r) => (
                    <button key={r.code} disabled={rolesBusy} onClick={() => toggleRole(r.code)} className="abtn abtn-sm" style={{ background: userRoles.has(r.code) ? 'var(--red)' : 'var(--surface)', color: userRoles.has(r.code) ? '#fff' : 'var(--ink)', border: userRoles.has(r.code) ? 'none' : '1.5px solid var(--border)' }}>{roleLabel(r.code)}</button>
                  ))}
                </div>
                <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>Клик переключает роль. Роль определяет права: публикация объявлений, работа с агентством, доступ к лидам.</p>
              </div>
            </div>
          </div>
          <div className="a-card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 17, marginBottom: 12 }}>Объявления пользователя</h3>
            {/* API «листинги пользователя» отсутствует → секция пустая. */}
            <p className="muted" style={{ fontSize: 14 }}>—</p>
          </div>
        </div>
        <div className="a-card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 15, marginBottom: 14 }}>Действия</h3>
          <div className="col gap-10">
            {user.status === 'deleted' ? (
              /* Аккаунт удалён: «разблокировать» тут нечего — объявления уже сняты
                 навсегда, а телефон/e-mail мог занять новый аккаунт (частичная
                 уникальность контактов), поэтому возврат в ACTIVE упирается в 409. */
              <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>Аккаунт удалён — восстановление не поддерживается. Объявления сняты, а телефон и e-mail могли быть заняты новой регистрацией.</p>
            ) : (
              <>
                <button className="abtn" disabled={statusBusy} style={{ width: '100%', background: user.status === 'active' ? 'var(--red-bg)' : 'var(--green-bg)', color: user.status === 'active' ? 'var(--red)' : 'var(--green)' }} onClick={() => (user.status === 'active' ? setReasonModalTarget('BLOCKED') : changeStatus('ACTIVE'))}>
                  {user.status === 'active' ? 'Заблокировать' : 'Разблокировать'}
                </button>
                <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
                <button className="abtn abtn-danger" disabled={statusBusy} style={{ width: '100%' }} onClick={() => setReasonModalTarget('DELETED')}>Удалить аккаунт</button>
              </>
            )}
          </div>
        </div>
      </div>
      {reasonModalTarget && (
        <UserStatusReasonModal
          target={reasonModalTarget}
          isSubmitting={statusBusy}
          onClose={() => setReasonModalTarget(null)}
          onConfirm={confirmReasonModal}
        />
      )}
    </div>
  );
}
