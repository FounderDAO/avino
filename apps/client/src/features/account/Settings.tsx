/**
 * Settings — вкладка «Настройки».
 * Язык интерфейса синхронизируется с бэком (PATCH /users/me + /users/me/profile).
 * Валюта и тумблеры уведомлений — пока локальное состояние: для них нет
 * контракта на бэке (см. TODO ниже).
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Pill } from '@/components/ui/pill';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store/hooks';
import {
  selectCurrentUser,
  selectIsAuthenticated,
} from '@/store/slices/authSlice';
import type { Language } from '@/store/api/authApi';
import {
  useUpdateProfileMutation,
  useUpdateUserMutation,
} from '@/store/api/usersApi';
import { getApiError } from '@/store/api/apiError';
import {
  isNotificationSoundEnabled,
  setNotificationSoundEnabled,
} from '@/lib/notificationSound';
import { DeleteAccountModal } from './DeleteAccountModal';

type LangChip = 'ru' | 'uz' | 'en';
const LANG_UPPER: Record<LangChip, Language> = { ru: 'RU', uz: 'UZ', en: 'EN' };
function toChip(lang: Language | undefined): LangChip {
  return lang ? (lang.toLowerCase() as LangChip) : 'ru';
}

/** Простой тумблер (мок). */
function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-pill transition-colors',
        on ? 'bg-teal' : 'bg-segment-track',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-card transition-[left]',
          on ? 'left-[22px]' : 'left-0.5',
        )}
      />
    </button>
  );
}

/** Ключи строк-настроек уведомлений (тексты — account.settings.notif.{key}). */
const NOTIF_SETTINGS = ['searches', 'messages', 'moderation', 'promo'] as const;

export function Settings() {
  const t = useTranslations('account');
  const tToasts = useTranslations('toasts');
  const isAuthed = useAppSelector(selectIsAuthenticated);
  const user = useAppSelector(selectCurrentUser);

  const [updateProfile] = useUpdateProfileMutation();
  const [updateUser, userState] = useUpdateUserMutation();

  const [lang, setLang] = React.useState<LangChip>('ru');
  const [langError, setLangError] = React.useState<string | null>(null);

  // TODO(no-backend: currency-pref) — нет контракта, держим локально.
  const [currency, setCurrency] = React.useState<'UZS' | 'USD'>('USD');
  // TODO(no-backend: notification-prefs) — нет контракта, держим локально.
  const [notifs, setNotifs] = React.useState<Record<string, boolean>>({
    searches: true,
    messages: true,
    moderation: true,
    promo: false,
  });
  const toggle = (k: string) => setNotifs((p) => ({ ...p, [k]: !p[k] }));

  // Реальный тумблер звука (в отличие от мок-настроек выше) — persist в localStorage.
  const [soundOn, setSoundOn] = React.useState(true);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  React.useEffect(() => setSoundOn(isNotificationSoundEnabled()), []);
  const toggleSound = () =>
    setSoundOn((prev) => {
      const next = !prev;
      setNotificationSoundEnabled(next);
      return next;
    });

  // Гидрация языка из текущего пользователя.
  React.useEffect(() => {
    if (user) setLang(toChip(user.default_language));
  }, [user]);

  const onLang = async (next: LangChip) => {
    if (next === lang) return;
    const prev = lang;
    setLang(next);
    setLangError(null);
    const nextLang = LANG_UPPER[next];
    try {
      await updateUser({ default_language: nextLang }).unwrap();
      await updateProfile({ preferred_language: nextLang }).unwrap();
      toast.success(tToasts('settingsSaved'));
    } catch (err) {
      setLang(prev); // откат при ошибке
      const apiErr = getApiError(err as Parameters<typeof getApiError>[0]);
      setLangError(apiErr?.message ?? t('settings.langError'));
    }
  };

  return (
    <div className="max-w-[640px]">
      <h1 className="mb-[18px] text-[28px]">{t('settings.title')}</h1>

      <div className="flex flex-col gap-4">
        {/* Язык и валюта */}
        <div className="rounded-card border border-border/60 bg-surface p-6 shadow-card">
          <h2 className="mb-4 text-lg">{t('settings.langCurrency')}</h2>

          <div className="mb-5">
            <div className="mb-[9px] text-[13px] font-bold">{t('settings.uiLanguage')}</div>
            <div className="flex gap-2">
              {(
                [
                  ['ru', 'Русский'],
                  ['uz', 'O‘zbekcha'],
                  ['en', 'English'],
                ] as const
              ).map(([k, v]) => (
                <Pill
                  key={k}
                  active={lang === k}
                  disabled={!isAuthed || userState.isLoading}
                  onClick={() => onLang(k)}
                >
                  {v}
                </Pill>
              ))}
            </div>
            {!isAuthed && (
              <p className="mt-1.5 text-[13px] text-muted-foreground">
                {t('settings.loginToSaveLang')}
              </p>
            )}
            {langError && (
              <p className="mt-1.5 text-[13px] font-semibold text-red">{langError}</p>
            )}
          </div>

          <div>
            <div className="mb-[9px] text-[13px] font-bold">{t('settings.currency')}</div>
            <div className="flex gap-2">
              {(['USD', 'UZS'] as const).map((k) => (
                <Pill key={k} active={currency === k} onClick={() => setCurrency(k)}>
                  {k === 'USD' ? t('settings.currencyUsd') : t('settings.currencyUzs')}
                </Pill>
              ))}
            </div>
          </div>
        </div>

        {/* Уведомления */}
        <div className="rounded-card border border-border/60 bg-surface p-6 shadow-card">
          <h2 className="mb-4 text-lg">{t('settings.notificationsTitle')}</h2>
          <div className="flex flex-col divide-y divide-border">
            {NOTIF_SETTINGS.map((key) => (
              <div key={key} className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="text-[15px] font-bold">{t(`settings.notif.${key}.title`)}</div>
                  <div className="mt-0.5 text-[13.5px] text-muted-foreground">
                    {t(`settings.notif.${key}.text`)}
                  </div>
                </div>
                <Toggle on={!!notifs[key]} onClick={() => toggle(key)} />
              </div>
            ))}
            <div className="flex items-center justify-between gap-4 py-3.5 last:pb-0">
              <div className="min-w-0">
                <div className="text-[15px] font-bold">
                  {t('settings.notifSound.title')}
                </div>
                <div className="mt-0.5 text-[13.5px] text-muted-foreground">
                  {t('settings.notifSound.text')}
                </div>
              </div>
              <Toggle on={soundOn} onClick={toggleSound} />
            </div>
          </div>
        </div>

        {/* Опасная зона: удаление аккаунта */}
        {isAuthed && (
          <div className="rounded-card border border-red/40 bg-surface p-6 shadow-card">
            <h2 className="mb-2 text-lg text-red">{t('deleteAccount.sectionTitle')}</h2>
            <p className="mb-4 text-[13.5px] text-muted-foreground">
              {t('deleteAccount.sectionText')}
            </p>
            <Button
              variant="outline"
              className="border-red/50 text-red hover:bg-red/10"
              onClick={() => setDeleteOpen(true)}
            >
              {t('deleteAccount.button')}
            </Button>
          </div>
        )}
      </div>

      <DeleteAccountModal open={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </div>
  );
}
