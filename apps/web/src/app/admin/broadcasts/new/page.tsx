'use client';

/**
 * Создание рассылки уведомлений (/admin/broadcasts/new, ADR-0103).
 *
 * Секции:
 *   1. Тип аудитории: SEGMENT (дефолт) / SINGLE.
 *   2. Поиск пользователя для SINGLE-режима (GET /admin/users?q=).
 *   3. Фильтры сегмента: язык, статус, роль (SEGMENT-режим).
 *   4. Каналы: чекбоксы IN_APP / EMAIL / PUSH / SMS + подсказка для SMS.
 *   5. Контент: title + body.
 *   6. Время: «Сейчас» / «Запланировать» + datetime-local.
 *   7. Живое превью аудитории с дебаунсом 400 мс (useRef-таймер).
 *   8. Предупреждение kill-switch для EMAIL / PUSH / SMS (best-effort).
 *   9. Модалка подтверждения с числом получателей → createBroadcast → redirect.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { SectionTitle } from '@/components/admin/ui/section-title';
import { IC } from '@/components/admin/icons';
import { useToast } from '@/components/admin/toast';
import {
  channelLabels,
  languageLabels,
  userStatusLabels,
  roleLabels,
  BROADCAST_CHANNELS,
  BROADCAST_LANGUAGES,
  BROADCAST_USER_STATUSES,
  BROADCAST_ROLES,
  SMS_TEMPLATE_HINT,
} from '@/components/admin/broadcast/shared';
import {
  useCreateBroadcastMutation,
  usePreviewAudienceMutation,
  type BroadcastChannelValue,
  type BroadcastLanguageValue,
  type BroadcastUserStatusValue,
  type CreateBroadcastRequest,
  type PreviewAudienceRequest,
  type AudiencePreview,
} from '@/store/api/adminBroadcastsApi';
import { useListAdminUsersQuery } from '@/store/api/adminUsersApi';
import type { AdminUserRow } from '@/store/api/adminTypes';

// Kill-switch: best-effort — если API нет, игнорируем, не ломаем страницу.
import {
  useGetNotificationSettingsQuery,
} from '@/store/api/adminNotificationSettingsApi';
import {
  useGetSmsSettingsQuery,
} from '@/store/api/adminSmsSettingsApi';

// ─── вспомогательные типы / утилиты ──────────────────────────────────────────

type AudienceType = 'SEGMENT' | 'SINGLE';
type SendMode = 'now' | 'scheduled';

/** Форматирует пользователя для отображения в строке поиска. */
function formatUser(u: AdminUserRow): string {
  const parts: string[] = [];
  if (u.email) parts.push(u.email);
  if (u.phone) parts.push(u.phone);
  return parts.join(' · ') || u.id;
}

// ─── компоненты ───────────────────────────────────────────────────────────────

/**
 * Простая модалка подтверждения отправки.
 * Оверлей + карточка в центре экрана, без внешних зависимостей.
 */
function ConfirmModal({
  total,
  isLoading,
  onConfirm,
  onCancel,
}: {
  total: number;
  isLoading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0,0,0,0.40)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="a-card"
        style={{
          padding: '28px 28px 24px',
          maxWidth: 420,
          width: '100%',
          borderRadius: 14,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 10 }}>
          Подтвердить отправку
        </div>
        <p style={{ fontSize: 14.5, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.5 }}>
          Будет отправлено{' '}
          <strong style={{ color: 'var(--ink)' }}>~{total}</strong>{' '}
          {declRecipients(total)}.
          Действие нельзя отменить после запуска.
        </p>
        <div className="row gap-10" style={{ justifyContent: 'flex-end' }}>
          <button className="abtn abtn-outline" onClick={onCancel} disabled={isLoading}>
            Отмена
          </button>
          <button
            className="abtn abtn-primary"
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Отправка…' : 'Подтвердить'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Склонение «получатель/получателей» для числа. */
function declRecipients(n: number): string {
  const mod = n % 100;
  const mod10 = n % 10;
  if (mod >= 11 && mod <= 19) return 'получателей';
  if (mod10 === 1) return 'получатель';
  if (mod10 >= 2 && mod10 <= 4) return 'получателя';
  return 'получателей';
}

// ─── основная страница ────────────────────────────────────────────────────────

export default function BroadcastNewPage() {
  const router = useRouter();
  const toast = useToast();

  // ── kill-switch (best-effort) ────────────────────────────────────────────
  const { data: notifSettings } = useGetNotificationSettingsQuery();
  const { data: smsSettings } = useGetSmsSettingsQuery();

  // ── API-мутации ──────────────────────────────────────────────────────────
  const [createBroadcast, { isLoading: isCreating }] = useCreateBroadcastMutation();
  const [previewAudience, { data: previewData }] = usePreviewAudienceMutation();

  // ── форма: стейт ─────────────────────────────────────────────────────────
  const [audienceType, setAudienceType] = useState<AudienceType>('SEGMENT');

  // SINGLE: поиск пользователя
  const [userQuery, setUserQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<AdminUserRow | null>(null);
  const [userDropOpen, setUserDropOpen] = useState(false);

  // SEGMENT: фильтры
  const [language, setLanguage] = useState<BroadcastLanguageValue>('RU');
  const [filterStatus, setFilterStatus] = useState<BroadcastUserStatusValue>('ACTIVE');
  const [filterRole, setFilterRole] = useState<string>('');

  // Каналы
  const [channels, setChannels] = useState<BroadcastChannelValue[]>(['IN_APP']);

  // Контент
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  // Время отправки
  const [mode, setMode] = useState<SendMode>('now');
  const [scheduledAt, setScheduledAt] = useState('');

  // Превью аудитории (последний успешный результат)
  const [livePreview, setLivePreview] = useState<AudiencePreview | null>(null);

  // Модалка подтверждения
  const [showConfirm, setShowConfirm] = useState(false);

  // ── поиск пользователей (SINGLE) ─────────────────────────────────────────
  const { data: usersData, isFetching: usersLoading } = useListAdminUsersQuery(
    { q: userQuery, page: 1, limit: 7 },
    { skip: audienceType !== 'SINGLE' || userQuery.trim().length < 2 },
  );
  const userResults: AdminUserRow[] = usersData?.data ?? [];

  // ── дебаунс превью аудитории ─────────────────────────────────────────────
  /**
   * Дебаунс реализован через useRef-таймер (без внешних библиотек).
   * При каждом изменении audience-параметров — отменяем предыдущий таймер
   * и запускаем новый на 400 мс. По истечении — вызываем previewAudience.
   */
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const schedulePreview = useCallback((req: PreviewAudienceRequest) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      previewAudience(req)
        .unwrap()
        .then((res) => setLivePreview(res))
        .catch(() => { /* молча — превью некритично */ });
    }, 400);
  }, [previewAudience]);

  // Запускаем превью при смене audience-параметров.
  useEffect(() => {
    const req: PreviewAudienceRequest = {
      audienceType,
      language,
      ...(audienceType === 'SINGLE' && selectedUser ? { targetUserId: selectedUser.id } : {}),
      ...(audienceType === 'SEGMENT' ? { filterStatus } : {}),
      ...(audienceType === 'SEGMENT' && filterRole ? { filterRole } : {}),
    };
    schedulePreview(req);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audienceType, selectedUser, language, filterStatus, filterRole]);

  // Очищаем таймер при анмаунте.
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  // ── обработчики каналов ───────────────────────────────────────────────────
  function toggleChannel(ch: BroadcastChannelValue) {
    setChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch],
    );
  }

  // ── kill-switch предупреждение для канала ─────────────────────────────────
  function channelKillSwitchWarning(ch: BroadcastChannelValue): string | null {
    if (ch === 'EMAIL' && notifSettings?.emailEnabled === false) {
      return 'Email-уведомления глобально выключены, доставка отложится';
    }
    if (ch === 'PUSH' && notifSettings?.pushEnabled === false) {
      return 'Push-уведомления глобально выключены, доставка отложится';
    }
    if (ch === 'SMS' && smsSettings?.smsEnabled === false) {
      return 'SMS глобально выключены, доставка отложится';
    }
    return null;
  }

  // ── валидация формы ───────────────────────────────────────────────────────
  function validate(): string | null {
    if (audienceType === 'SINGLE' && !selectedUser) {
      return 'Выберите пользователя для режима «Один пользователь»';
    }
    if (channels.length === 0) {
      return 'Выберите хотя бы один канал';
    }
    if (!title.trim()) return 'Введите заголовок сообщения';
    if (!body.trim()) return 'Введите текст сообщения';
    if (mode === 'scheduled') {
      if (!scheduledAt) return 'Укажите время отправки';
      if (new Date(scheduledAt) <= new Date()) {
        return 'Время отправки должно быть в будущем';
      }
    }
    return null;
  }

  // ── формирование payload ──────────────────────────────────────────────────
  function buildPayload(): CreateBroadcastRequest {
    const base: CreateBroadcastRequest = {
      audienceType,
      language,
      channels,
      title: title.trim(),
      body: body.trim(),
      mode,
    };
    if (audienceType === 'SINGLE' && selectedUser) {
      base.targetUserId = selectedUser.id;
    }
    if (audienceType === 'SEGMENT') {
      base.filterStatus = filterStatus;
      if (filterRole) base.filterRole = filterRole;
    }
    if (mode === 'scheduled' && scheduledAt) {
      base.scheduledAt = new Date(scheduledAt).toISOString();
    }
    return base;
  }

  // ── submit ────────────────────────────────────────────────────────────────
  function handleSubmitClick() {
    const err = validate();
    if (err) {
      toast(err);
      return;
    }
    setShowConfirm(true);
  }

  async function handleConfirm() {
    try {
      const result = await createBroadcast(buildPayload()).unwrap();
      toast('Рассылка создана');
      router.push(`/admin/broadcasts/${result.id}`);
    } catch {
      toast('Не удалось создать рассылку');
      setShowConfirm(false);
    }
  }

  // ── превью-блок: только каналы, отмеченные в форме ───────────────────────
  const previewToShow = livePreview ?? previewData;

  const channelPreviewLabel: Record<BroadcastChannelValue, keyof AudiencePreview['perChannel']> = {
    IN_APP: 'inApp',
    EMAIL: 'email',
    PUSH: 'push',
    SMS: 'sms',
  };

  // ── разметка ─────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 760 }}>
      {/* ── Заголовок ──────────────────────────────────────────────────────── */}
      <div
        className="row"
        style={{ alignItems: 'center', gap: 12, marginBottom: 22 }}
      >
        <button
          className="abtn abtn-outline"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          onClick={() => router.push('/admin/broadcasts')}
        >
          <IC.ChevronLeft size={16} />
          Назад
        </button>
        <SectionTitle sub="Новая рассылка уведомлений">Создать рассылку</SectionTitle>
      </div>

      {/* ── 1. Тип аудитории ───────────────────────────────────────────────── */}
      <div className="a-card" style={{ padding: '20px 24px', marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>
          Тип аудитории
        </div>
        <div className="row gap-10">
          {(['SEGMENT', 'SINGLE'] as AudienceType[]).map((type) => {
            const label = type === 'SEGMENT' ? 'Массовая (сегмент)' : 'Одному пользователю';
            const active = audienceType === type;
            return (
              <button
                key={type}
                className="abtn abtn-sm"
                onClick={() => {
                  setAudienceType(type);
                  setSelectedUser(null);
                  setUserQuery('');
                }}
                style={{
                  background: active ? 'var(--ink)' : 'var(--surface)',
                  color: active ? '#fff' : 'var(--ink)',
                  border: active ? 'none' : '1.5px solid var(--border)',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 2. SINGLE: поиск пользователя ─────────────────────────────────── */}
      {audienceType === 'SINGLE' && (
        <div className="a-card" style={{ padding: '20px 24px', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>
            Пользователь
          </div>
          {selectedUser ? (
            <div
              className="row gap-10"
              style={{
                alignItems: 'center',
                background: 'var(--surface)',
                borderRadius: 9,
                padding: '10px 14px',
                border: '1.5px solid var(--border)',
              }}
            >
              <IC.User size={16} style={{ color: 'var(--muted)' }} />
              <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>
                {formatUser(selectedUser)}
              </span>
              <button
                className="abtn abtn-sm abtn-outline"
                onClick={() => {
                  setSelectedUser(null);
                  setUserQuery('');
                }}
              >
                Изменить
              </button>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <input
                className="a-field"
                style={{ width: '100%' }}
                placeholder="Поиск по email или телефону…"
                value={userQuery}
                onChange={(e) => {
                  setUserQuery(e.target.value);
                  setUserDropOpen(true);
                }}
                onFocus={() => setUserDropOpen(true)}
                onBlur={() => setTimeout(() => setUserDropOpen(false), 180)}
              />
              {userDropOpen && userQuery.trim().length >= 2 && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 50,
                    background: 'var(--surface)',
                    border: '1.5px solid var(--border)',
                    borderRadius: 9,
                    marginTop: 4,
                    boxShadow: 'var(--sh-raised)',
                    overflow: 'hidden',
                  }}
                >
                  {usersLoading ? (
                    <div className="muted" style={{ padding: '12px 16px', fontSize: 13.5 }}>
                      Поиск…
                    </div>
                  ) : userResults.length === 0 ? (
                    <div className="muted" style={{ padding: '12px 16px', fontSize: 13.5 }}>
                      Пользователи не найдены
                    </div>
                  ) : (
                    userResults.map((u) => (
                      <button
                        key={u.id}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '10px 16px',
                          fontSize: 13.5,
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          borderBottom: '1px solid var(--border)',
                        }}
                        onMouseDown={() => {
                          setSelectedUser(u);
                          setUserQuery('');
                          setUserDropOpen(false);
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>{formatUser(u)}</span>
                        {u.roles.length > 0 && (
                          <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>
                            {u.roles.join(', ')}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── 3. SEGMENT: фильтры + язык (язык виден всегда) ────────────────── */}
      <div className="a-card" style={{ padding: '20px 24px', marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>
          {audienceType === 'SEGMENT' ? 'Параметры сегмента' : 'Язык сообщения'}
        </div>
        <div className="col gap-14">
          {/* Язык — всегда */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
              Язык сообщения
            </label>
            <select
              className="a-field"
              style={{ width: '100%', maxWidth: 280 }}
              value={language}
              onChange={(e) => setLanguage(e.target.value as BroadcastLanguageValue)}
            >
              {BROADCAST_LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {languageLabels[lang]}
                </option>
              ))}
            </select>
          </div>

          {/* Статус и роль — только для SEGMENT */}
          {audienceType === 'SEGMENT' && (
            <>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Статус пользователей
                </label>
                <select
                  className="a-field"
                  style={{ width: '100%', maxWidth: 280 }}
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as BroadcastUserStatusValue)}
                >
                  {BROADCAST_USER_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {userStatusLabels[st]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Роль (опционально)
                </label>
                <select
                  className="a-field"
                  style={{ width: '100%', maxWidth: 280 }}
                  value={filterRole}
                  onChange={(e) => setFilterRole(e.target.value)}
                >
                  <option value="">Любая роль</option>
                  {BROADCAST_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {roleLabels[role] ?? role}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── 4. Каналы ─────────────────────────────────────────────────────── */}
      <div className="a-card" style={{ padding: '20px 24px', marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>
          Каналы доставки
        </div>
        <div className="col gap-10">
          {BROADCAST_CHANNELS.map((ch) => {
            const checked = channels.includes(ch);
            const warn = channelKillSwitchWarning(ch);
            return (
              <div key={ch}>
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 10,
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: checked ? 600 : 400,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleChannel(ch)}
                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                  />
                  {channelLabels[ch]}
                </label>
                {warn && (
                  <div
                    style={{
                      marginLeft: 26,
                      marginTop: 2,
                      fontSize: 12,
                      color: 'var(--warn)',
                    }}
                  >
                    ⚠ {warn}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {/* Подсказка SMS */}
        {channels.includes('SMS') && (
          <div
            style={{
              marginTop: 12,
              padding: '10px 14px',
              background: 'var(--archive-bg)',
              borderRadius: 8,
              fontSize: 12.5,
              color: 'var(--muted)',
              lineHeight: 1.5,
            }}
          >
            {SMS_TEMPLATE_HINT}
          </div>
        )}
      </div>

      {/* ── 5. Контент ────────────────────────────────────────────────────── */}
      <div className="a-card" style={{ padding: '20px 24px', marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>
          Содержимое уведомления
        </div>
        <div className="col gap-14">
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
              Заголовок
            </label>
            <input
              className="a-field"
              style={{ width: '100%' }}
              placeholder="Краткий заголовок…"
              maxLength={255}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <div
              style={{
                fontSize: 12,
                color: title.length > 230 ? 'var(--warn)' : 'var(--muted)',
                marginTop: 4,
                textAlign: 'right',
              }}
            >
              {title.length} / 255
            </div>
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
              Текст сообщения
            </label>
            <textarea
              className="a-field"
              style={{ width: '100%', minHeight: 110, resize: 'vertical' }}
              placeholder="Полный текст уведомления…"
              maxLength={4000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <div
              style={{
                fontSize: 12,
                color: body.length > 3800 ? 'var(--warn)' : 'var(--muted)',
                marginTop: 4,
                textAlign: 'right',
              }}
            >
              {body.length} / 4000
            </div>
          </div>
        </div>
      </div>

      {/* ── 6. Время отправки ─────────────────────────────────────────────── */}
      <div className="a-card" style={{ padding: '20px 24px', marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>
          Время отправки
        </div>
        <div className="col gap-10">
          {(['now', 'scheduled'] as SendMode[]).map((m) => {
            const label = m === 'now' ? 'Отправить сейчас' : 'Запланировать';
            return (
              <label
                key={m}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: mode === m ? 600 : 400,
                }}
              >
                <input
                  type="radio"
                  name="send-mode"
                  checked={mode === m}
                  onChange={() => setMode(m)}
                  style={{ width: 16, height: 16, cursor: 'pointer' }}
                />
                {label}
              </label>
            );
          })}
        </div>

        {mode === 'scheduled' && (
          <div style={{ marginTop: 14 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
              Дата и время
            </label>
            <input
              type="datetime-local"
              className="a-field"
              style={{ maxWidth: 300 }}
              value={scheduledAt}
              min={new Date().toISOString().slice(0, 16)}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
            {scheduledAt && new Date(scheduledAt) <= new Date() && (
              <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--red)' }}>
                Время должно быть в будущем
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 7. Превью аудитории ───────────────────────────────────────────── */}
      {previewToShow && (
        <div
          className="a-card"
          style={{
            padding: '16px 24px',
            marginBottom: 16,
            border: '1.5px solid var(--border)',
          }}
        >
          <div
            className="row gap-12"
            style={{ alignItems: 'center', flexWrap: 'wrap' }}
          >
            <IC.Bell size={17} style={{ color: 'var(--teal)' }} />
            <span style={{ fontWeight: 700, fontSize: 14 }}>
              Получат: ~{previewToShow.total} {declRecipients(previewToShow.total)}
            </span>
            <div
              className="row gap-8"
              style={{ marginLeft: 'auto', flexWrap: 'wrap' }}
            >
              {channels.map((ch) => {
                const key = channelPreviewLabel[ch];
                const count = previewToShow.perChannel[key];
                return (
                  <span
                    key={ch}
                    style={{
                      fontSize: 12.5,
                      color: 'var(--muted)',
                      background: 'var(--surface)',
                      borderRadius: 6,
                      padding: '3px 8px',
                      border: '1px solid var(--border)',
                    }}
                  >
                    {channelLabels[ch]}: {count}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── 8. Кнопка отправки ────────────────────────────────────────────── */}
      <div
        className="row gap-12"
        style={{ justifyContent: 'flex-end', marginBottom: 32 }}
      >
        <button
          className="abtn abtn-outline"
          onClick={() => router.push('/admin/broadcasts')}
        >
          Отмена
        </button>
        <button
          className="abtn abtn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          onClick={handleSubmitClick}
          disabled={isCreating}
        >
          <IC.Send size={16} />
          {mode === 'now' ? 'Отправить' : 'Запланировать'}
        </button>
      </div>

      {/* ── 9. Модалка подтверждения ──────────────────────────────────────── */}
      {showConfirm && (
        <ConfirmModal
          total={previewToShow?.total ?? 0}
          isLoading={isCreating}
          onConfirm={() => void handleConfirm()}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}
