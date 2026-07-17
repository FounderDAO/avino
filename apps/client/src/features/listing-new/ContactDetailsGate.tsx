/**
 * ContactDetailsGate — экран «Контактные данные» в визарде /sell/new
 * (ADR-0125). Показывается вошедшему пользователю с неполным профилем
 * (см. isProfileCompleteForListing). Сохраняет Имя/Фамилию/Телефон через
 * PATCH /users/me/profile; мутация инвалидирует Auth → getMe перечитывается →
 * родитель сам скрывает гейт. Телефон пишется в contact_phone (без OTP).
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { PhoneField } from '@/components/ui/phone-field';
import { formatUzPhone, uzPhoneComplete, uzPhoneE164 } from '@/lib/phone-mask';
import { useAppSelector } from '@/store/hooks';
import { selectCurrentUser } from '@/store/slices/authSlice';
import { useUpdateProfileMutation } from '@/store/api/usersApi';
import { getApiError } from '@/store/api/apiError';

export function ContactDetailsGate() {
  const t = useTranslations('listingNew');
  const user = useAppSelector(selectCurrentUser);
  const [updateProfile, { isLoading }] = useUpdateProfileMutation();

  const [firstName, setFirstName] = React.useState(
    user?.profile?.first_name ?? '',
  );
  const [lastName, setLastName] = React.useState(user?.profile?.last_name ?? '');
  const [phone, setPhone] = React.useState(
    formatUzPhone(user?.profile?.contact_phone ?? user?.phone ?? ''),
  );
  const [error, setError] = React.useState<string | null>(null);

  // Ре-синк при догрузке getMe: гейт монтируется до прихода user
  // (isAuthenticated из токена синхронен, getMe асинхронен).
  React.useEffect(() => {
    if (!user) return;
    setFirstName(user.profile?.first_name ?? '');
    setLastName(user.profile?.last_name ?? '');
    setPhone(formatUzPhone(user.profile?.contact_phone ?? user.phone ?? ''));
  }, [user]);

  const canSubmit =
    Boolean(firstName.trim()) && Boolean(lastName.trim()) && uzPhoneComplete(phone);

  const onSubmit = async () => {
    setError(null);
    try {
      await updateProfile({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        contact_phone: uzPhoneE164(phone),
      }).unwrap();
      // Успех: инвалидация Auth перечитает getMe, гейт исчезнет сам.
    } catch (err) {
      const apiErr = getApiError(err as Parameters<typeof getApiError>[0]);
      setError(apiErr?.message ?? t('contactGate.error'));
    }
  };

  return (
    <div className="fade-up mx-auto max-w-[620px] px-6 py-16">
      <div className="mx-auto mb-5 flex h-21 w-21 items-center justify-center rounded-full bg-mint text-teal-deep">
        <UserRound size={38} strokeWidth={2.2} />
      </div>
      <h1 className="text-center text-[30px]">{t('contactGate.title')}</h1>
      <p className="mx-auto mb-7 mt-3 max-w-[460px] text-center text-base text-muted-foreground">
        {t('contactGate.text')}
      </p>
      <div className="mx-auto flex max-w-[420px] flex-col gap-4">
        <div>
          <label htmlFor="cg-first" className="mb-[7px] block text-[13px] font-bold">
            {t('contactGate.firstName')}
          </label>
          <Field
            id="cg-first"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="cg-last" className="mb-[7px] block text-[13px] font-bold">
            {t('contactGate.lastName')}
          </label>
          <Field
            id="cg-last"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="cg-phone" className="mb-[7px] block text-[13px] font-bold">
            {t('contactGate.phone')}
          </label>
          <PhoneField
            id="cg-phone"
            placeholder={t('contactGate.phonePlaceholder')}
            value={phone}
            onChange={setPhone}
          />
        </div>
        {error && <p className="text-[13px] font-semibold text-red">{error}</p>}
        <Button
          size="lg"
          className="mt-1.5"
          disabled={!canSubmit || isLoading}
          onClick={onSubmit}
        >
          {isLoading ? t('contactGate.saving') : t('contactGate.submit')}
        </Button>
      </div>
    </div>
  );
}
