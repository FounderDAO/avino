/**
 * Profile — вкладка «Профиль».
 * Гидрируется из текущего пользователя (GET /auth/me → authSlice) и сохраняет
 * изменения двумя PATCH-вызовами: профиль (имя/телефон) и пользователь (email).
 * Язык интерфейса живёт на вкладке «Настройки» (Settings) — здесь его нет.
 * Гость → подсказка войти.
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Link } from '@/i18n/navigation';
import { Field } from '@/components/ui/field';
import { PhoneField } from '@/components/ui/phone-field';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useAppSelector } from '@/store/hooks';
import { formatUzPhone, uzPhoneE164 } from '@/lib/phone-mask';
import {
  selectCurrentUser,
  selectIsAuthenticated,
} from '@/store/slices/authSlice';
import {
  useUpdateProfileMutation,
  useUpdateUserMutation,
  useUploadAvatarMutation,
  useDeleteAvatarMutation,
} from '@/store/api/usersApi';
import { getApiError } from '@/store/api/apiError';

/** Разрешённые типы аватара и лимит размера — зеркалят валидацию бэкенда. */
const AVATAR_ACCEPT = 'image/jpeg,image/png,image/webp';
const AVATAR_MAX_BYTES = 10 * 1024 * 1024;

/** Состояние формы профиля. */
interface ProfileForm {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
}

export function Profile() {
  const t = useTranslations('account');
  const tToasts = useTranslations('toasts');
  const isAuthed = useAppSelector(selectIsAuthenticated);
  const user = useAppSelector(selectCurrentUser);

  const [updateProfile, profileState] = useUpdateProfileMutation();
  const [updateUser, userState] = useUpdateUserMutation();
  const [uploadAvatar, uploadState] = useUploadAvatarMutation();
  const [deleteAvatar, deleteState] = useDeleteAvatarMutation();

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  // Локальное превью на время запроса (blob) — чтобы аватар не «моргал».
  const [avatarPreview, setAvatarPreview] = React.useState<string | null>(null);
  const previewBlobRef = React.useRef<string | null>(null);

  // Освобождаем blob-URL при размонтировании.
  React.useEffect(
    () => () => {
      if (previewBlobRef.current) URL.revokeObjectURL(previewBlobRef.current);
    },
    [],
  );

  // Как только стор получил новую avatar_url (после инвалидации getMe) —
  // сбрасываем локальное blob-превью и показываем серверную версию.
  React.useEffect(() => {
    if (previewBlobRef.current) URL.revokeObjectURL(previewBlobRef.current);
    previewBlobRef.current = null;
    setAvatarPreview(null);
  }, [user?.profile.avatar_url]);

  const [form, setForm] = React.useState<ProfileForm>({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
  });
  const [emailError, setEmailError] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);

  // Ре-синк формы при загрузке/обновлении пользователя.
  React.useEffect(() => {
    if (!user) return;
    setForm({
      firstName: user.profile.first_name ?? '',
      lastName: user.profile.last_name ?? '',
      phone: formatUzPhone(user.profile.contact_phone ?? user.phone ?? ''),
      email: user.email ?? '',
    });
  }, [user]);

  const set = <K extends keyof ProfileForm>(k: K, v: ProfileForm[K]) => {
    setForm((p) => ({ ...p, [k]: v }));
    setEmailError(null);
    setFormError(null);
  };

  if (!isAuthed) {
    return (
      <div className="max-w-[560px]">
        <h1 className="mb-[18px] text-[28px]">{t('profile.title')}</h1>
        <div className="rounded-card border border-border/60 bg-surface shadow-card">
          <EmptyState
            title={t('profile.authTitle')}
            text={t('profile.authText')}
            action={
              <Button asChild>
                <Link href="/">{t('profile.login')}</Link>
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const pending = profileState.isLoading || userState.isLoading;
  const avatarChar = (form.firstName.trim()[0] ?? 'A').toUpperCase();

  const avatarUrl = user?.profile.avatar_url ?? null;
  const avatarSrc = avatarPreview ?? avatarUrl;
  const avatarBusy = uploadState.isLoading || deleteState.isLoading;

  const clearPreviewBlob = () => {
    if (previewBlobRef.current) {
      URL.revokeObjectURL(previewBlobRef.current);
      previewBlobRef.current = null;
    }
  };

  const onPickAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Сброс value — чтобы повторный выбор того же файла снова триггерил change.
    e.target.value = '';
    if (!file) return;

    if (!AVATAR_ACCEPT.split(',').includes(file.type)) {
      toast.error(t('profile.avatarInvalidType'));
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      toast.error(t('profile.avatarTooLarge'));
      return;
    }

    clearPreviewBlob();
    const blobUrl = URL.createObjectURL(file);
    previewBlobRef.current = blobUrl;
    setAvatarPreview(blobUrl);

    try {
      await uploadAvatar(file).unwrap();
      // Blob-превью держим до перечитывания getMe (его сбросит эффект на
      // avatar_url) — без мигания и без риска протухания presigned-ссылки.
      toast.success(tToasts('avatarUpdated'));
    } catch {
      clearPreviewBlob();
      setAvatarPreview(null);
      toast.error(tToasts('avatarActionFailed'));
    }
  };

  const onRemoveAvatar = async () => {
    try {
      await deleteAvatar().unwrap();
      clearPreviewBlob();
      setAvatarPreview(null);
      toast.success(tToasts('avatarRemoved'));
    } catch {
      toast.error(tToasts('avatarActionFailed'));
    }
  };

  const onSave = async () => {
    setEmailError(null);
    setFormError(null);

    const trimmedEmail = form.email.trim();

    try {
      // Профиль: имя/телефон — всегда. Язык живёт на вкладке «Настройки».
      await updateProfile({
        first_name: form.firstName.trim() || null,
        last_name: form.lastName.trim() || null,
        // Публичное имя становится производным «Имя Фамилия» (buildContact
        // на бэке: displayName ?? first+last) — иначе display_name из Google
        // навсегда перекрывал бы отредактированные Имя/Фамилию.
        display_name: null,
        contact_phone: uzPhoneE164(form.phone) || null,
      }).unwrap();

      // Пользователь: только при изменении email.
      if (user && trimmedEmail !== (user.email ?? '')) {
        await updateUser({ email: trimmedEmail }).unwrap();
      }

      toast.success(tToasts('profileSaved'));
    } catch (err) {
      const apiErr = getApiError(err as Parameters<typeof getApiError>[0]);
      if (apiErr?.code === 'CONTACT_TAKEN') {
        setEmailError(t('profile.emailTaken'));
      } else {
        setFormError(apiErr?.message ?? t('profile.saveError'));
      }
    }
  };

  return (
    <div className="max-w-[560px]">
      <h1 className="mb-[18px] text-[28px]">{t('profile.title')}</h1>
      <div className="rounded-card border border-border/60 bg-surface p-6 shadow-card">
        {/* Аватар + смена фото */}
        <div className="mb-[22px] flex items-center gap-4">
          <span className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-teal text-[28px] font-extrabold text-white">
            {avatarSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarSrc}
                alt={t('profile.avatarAlt')}
                className="h-full w-full object-cover"
              />
            ) : (
              avatarChar
            )}
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept={AVATAR_ACCEPT}
            className="hidden"
            onChange={onPickAvatar}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarBusy}
            >
              {uploadState.isLoading ? t('profile.uploadingPhoto') : t('profile.changePhoto')}
            </Button>
            {avatarSrc && (
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={onRemoveAvatar}
                disabled={avatarBusy}
              >
                {t('profile.removePhoto')}
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-[7px] block text-[13px] font-bold">{t('profile.firstName')}</label>
            <Field value={form.firstName} onChange={(e) => set('firstName', e.target.value)} />
          </div>
          <div>
            <label className="mb-[7px] block text-[13px] font-bold">{t('profile.lastName')}</label>
            <Field value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
          </div>
          <div>
            <label className="mb-[7px] block text-[13px] font-bold">{t('profile.phone')}</label>
            <PhoneField
              value={form.phone}
              onChange={(v) => set('phone', v)}
              placeholder="+998 90 123 45 67"
            />
          </div>
          <div>
            <label className="mb-[7px] block text-[13px] font-bold">{t('profile.email')}</label>
            <Field
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              aria-invalid={emailError ? true : undefined}
            />
            {emailError && (
              <p className="mt-1.5 text-[13px] font-semibold text-red">{emailError}</p>
            )}
          </div>

          {formError && (
            <p className="text-[13px] font-semibold text-red">{formError}</p>
          )}
          <Button
            type="button"
            className="mt-1.5 self-start"
            onClick={onSave}
            disabled={pending}
          >
            {pending ? t('profile.saving') : t('profile.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
