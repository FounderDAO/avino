'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Dialog } from 'radix-ui';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { getApiError, isNetworkError } from '@/store/api/apiError';
import { useAcceptLegalConsentMutation } from '@/store/api/usersApi';

/**
 * Блокирующая модалка согласия с Правилами и Политикой (design 2026-06-29 §5).
 * Монтируется только когда согласие требуется (см. LegalConsentGate). Нельзя
 * закрыть: нет крестика, Esc и клик вне — preventDefault. Кнопка «Согласен»
 * активна только когда отмечены обе галочки. После успеха getMe перечитывается
 * (invalidatesTags) → гейт размонтирует модалку.
 */
export function LegalConsentModal() {
  const t = useTranslations('legalConsent');
  const [terms, setTerms] = React.useState(false);
  const [privacy, setPrivacy] = React.useState(false);
  const [accept, state] = useAcceptLegalConsentMutation();

  const apiError = getApiError(state.error);
  const errorMessage = apiError
    ? t('errors.incomplete')
    : isNetworkError(state.error)
      ? t('errors.network')
      : null;

  const handleAccept = async () => {
    try {
      await accept({ terms_accepted: terms, privacy_accepted: privacy }).unwrap();
      /* успех: getMe перечитывается, гейт размонтирует модалку */
    } catch {
      /* ошибка показывается через errorMessage */
    }
  };

  return (
    <Dialog.Root open onOpenChange={() => undefined}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-ink/50 backdrop-blur-[3px]" />
        <Dialog.Content
          className="fade-up fixed left-1/2 top-1/2 z-[81] w-[calc(100%-40px)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-[20px] bg-surface p-8 shadow-raised"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <Dialog.Title className="text-[24px]">{t('title')}</Dialog.Title>
          <Dialog.Description className="mt-1.5 text-[14.5px] text-muted-foreground">
            {t('description')}
          </Dialog.Description>

          <div className="mt-6 space-y-3.5">
            <label htmlFor="consent-terms" className="flex items-start gap-3 text-[14.5px]">
              <input
                id="consent-terms"
                type="checkbox"
                checked={terms}
                onChange={(e) => setTerms(e.target.checked)}
                className="mt-0.5 size-[18px] shrink-0 accent-red"
              />
              <span>
                {t('termsPrefix')}{' '}
                <Link href="/legal/terms" target="_blank" className="font-semibold text-teal hover:text-teal-deep">
                  {t('termsLink')}
                </Link>
              </span>
            </label>

            <label htmlFor="consent-privacy" className="flex items-start gap-3 text-[14.5px]">
              <input
                id="consent-privacy"
                type="checkbox"
                checked={privacy}
                onChange={(e) => setPrivacy(e.target.checked)}
                className="mt-0.5 size-[18px] shrink-0 accent-red"
              />
              <span>
                {t('privacyPrefix')}{' '}
                <Link href="/legal/privacy" target="_blank" className="font-semibold text-teal hover:text-teal-deep">
                  {t('privacyLink')}
                </Link>
              </span>
            </label>
          </div>

          {errorMessage && (
            <p className="mt-4 text-[13.5px] text-red" role="alert">
              {errorMessage}
            </p>
          )}

          <Button
            className="mt-6 w-full"
            disabled={!terms || !privacy || state.isLoading}
            onClick={handleAccept}
          >
            {t('accept')}
          </Button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
