/**
 * BecomeAgent — страница /become-agent, заявка «Стать агентом» (ADR-0140).
 * Гейт авторизации зеркалит ListingNew (selectIsAuthenticated + LoginModal,
 * модалка открывается эффектом после монтирования — без SSR/гидрационного
 * мелькания). Состояния (по currentUser.roles + useGetMyAgentApplicationQuery):
 *  1. Гость → экран входа.
 *  2. currentUser.roles содержит AGENT/AGENCY, либо заявка уже APPROVED
 *     (роли ещё не подтянулись — например, deep-link из уведомления) →
 *     карточка «Вы уже агент».
 *  3. Заявка PENDING → карточка «На рассмотрении».
 *  4. Заявка REJECTED → причина отказа + форма повторной подачи (префилл).
 *  5. Заявок нет → форма подачи.
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { BadgeCheck, Clock, Loader2, Lock } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Field, fieldClass } from '@/components/ui/field';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store/hooks';
import {
  selectAuthResolved,
  selectCurrentUser,
  selectIsAuthenticated,
} from '@/store/slices/authSlice';
import {
  useGetMyAgentApplicationQuery,
  useSubmitAgentApplicationMutation,
} from '@/store/api/agentApplicationsApi';
import { getApiError } from '@/store/api/apiError';
import { LoginModal } from '@/components/layout/LoginModal';

const AGENCY_NAME_MAX = 255;
const ABOUT_MAX = 2000;

/**
 * Дата в формате dd.mm.yyyy — части берём в UTC (как PriceHistory.formatDate),
 * чтобы SSR (сервер в UTC) и браузер не расходились по календарному дню.
 */
function formatDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getUTCFullYear()}`;
}

export function BecomeAgent() {
  const t = useTranslations('becomeAgent');
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const authResolved = useAppSelector(selectAuthResolved);
  const currentUser = useAppSelector(selectCurrentUser);

  // Гейт авторизации: гостю сразу открываем модалку входа, но через эффект
  // (после монтирования) и ТОЛЬКО после разрешения сессии (ADR-0153) — иначе
  // модалка мелькала бы у уже залогиненных, пока cookie-сессия проверяется.
  const [loginOpen, setLoginOpen] = React.useState(false);
  React.useEffect(() => {
    if (authResolved && !isAuthenticated) setLoginOpen(true);
  }, [authResolved, isAuthenticated]);

  const isAgent = Boolean(
    currentUser?.roles.some((r) => r === 'AGENT' || r === 'AGENCY'),
  );

  const { data: application, isLoading: loadingApplication } =
    useGetMyAgentApplicationQuery(undefined, {
      skip: !isAuthenticated || isAgent,
    });

  const [submitAgentApplication, { isLoading: submitting, error: submitError }] =
    useSubmitAgentApplicationMutation();

  const [agencyName, setAgencyName] = React.useState('');
  const [about, setAbout] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);

  // Префилл прошлых значений при REJECTED (повторная подача) — синхронизируем
  // только при появлении/смене конкретной заявки, а не на каждый рендер.
  React.useEffect(() => {
    if (application?.status === 'REJECTED') {
      setAgencyName(application.agencyName ?? '');
      setAbout(application.about);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [application?.id, application?.status]);

  const apiError = getApiError(submitError);
  const submitErrorMessage =
    apiError?.code === 'ALREADY_AGENT'
      ? t('errors.alreadyAgent')
      : apiError?.code === 'AGENT_APPLICATION_PENDING'
        ? t('errors.pending')
        : (apiError?.message ?? (submitError ? t('errors.generic') : undefined));

  const handleSubmit = async () => {
    setFormError(null);
    if (!about.trim()) {
      setFormError(t('errors.aboutRequired'));
      return;
    }
    try {
      await submitAgentApplication({
        agencyName: agencyName.trim() || undefined,
        about: about.trim(),
      }).unwrap();
    } catch {
      // Ошибка покажется через submitErrorMessage (error-envelope мутации).
    }
  };

  // ---- 0. Проверяем сессию (пробный silent-refresh, ADR-0153) ----
  if (!authResolved) {
    return (
      <div className="mx-auto flex max-w-[620px] items-center justify-center px-6 py-24 text-muted-foreground">
        <Loader2 className="animate-spin" size={22} />
      </div>
    );
  }

  // ---- 1. Гость ----
  if (!isAuthenticated) {
    return (
      <>
        <div className="fade-up mx-auto max-w-[620px] px-6 py-16 text-center">
          <div className="mx-auto mb-5 flex h-21 w-21 items-center justify-center rounded-full bg-mint text-teal-deep">
            <Lock size={38} strokeWidth={2.2} />
          </div>
          <h1 className="text-[30px]">{t('auth.title')}</h1>
          <p className="mx-auto mb-7 mt-3 max-w-[460px] text-base text-muted-foreground">
            {t('auth.text')}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button size="lg" onClick={() => setLoginOpen(true)}>
              {t('auth.login')}
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/">{t('auth.home')}</Link>
            </Button>
          </div>
        </div>
        <LoginModal
          open={loginOpen}
          onOpenChange={setLoginOpen}
          context={t('auth.context')}
        />
      </>
    );
  }

  // ---- 2. Уже агент/агентство (роли, либо заявка уже APPROVED — роли ещё
  // не подтянулись, например при переходе по deep-link из уведомления) ----
  if (isAgent || application?.status === 'APPROVED') {
    return (
      <div className="fade-up mx-auto max-w-[620px] px-6 py-16 text-center">
        <div className="mx-auto mb-5 flex h-21 w-21 items-center justify-center rounded-full bg-green-bg text-green">
          <BadgeCheck size={38} strokeWidth={2.2} />
        </div>
        <h1 className="text-[30px]">{t('alreadyAgent.title')}</h1>
        <p className="mx-auto mb-7 mt-3 max-w-[460px] text-base text-muted-foreground">
          {t('alreadyAgent.text')}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/sell/new">{t('alreadyAgent.createListing')}</Link>
          </Button>
          {currentUser && (
            <Button asChild size="lg" variant="outline">
              <Link href={`/agents/${currentUser.id}`}>
                {t('alreadyAgent.myProfile')}
              </Link>
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ---- Загрузка статуса заявки ----
  if (loadingApplication) {
    return (
      <div className="fade-up mx-auto max-w-[620px] px-6 py-16 text-center text-muted-foreground">
        {t('loading')}
      </div>
    );
  }

  // ---- 3. Заявка на рассмотрении ----
  if (application?.status === 'PENDING') {
    return (
      <div className="fade-up mx-auto max-w-[620px] px-6 py-16 text-center">
        <div className="mx-auto mb-5 flex h-21 w-21 items-center justify-center rounded-full bg-mint text-teal-deep">
          <Clock size={38} strokeWidth={2.2} />
        </div>
        <h1 className="text-[30px]">{t('pending.title')}</h1>
        <p className="mx-auto max-w-[460px] text-base text-muted-foreground">
          {t('pending.text', { date: formatDate(application.createdAt) })}
        </p>
      </div>
    );
  }

  // ---- 4/5. Форма подачи (нет заявки, либо REJECTED — повторная подача) ----
  const isResubmit = application?.status === 'REJECTED';

  return (
    <div className="fade-up mx-auto max-w-[620px] px-6 pb-16 pt-10">
      <h1 className="mb-1.5 text-3xl">{t('title')}</h1>
      <p className="mb-6 text-muted-foreground">{t('intro')}</p>

      {isResubmit && (
        <div className="mb-6 rounded-input bg-red/5 px-4 py-3 text-[13.5px] text-red">
          <p className="font-bold">{t('rejected.title')}</p>
          {application.rejectReason && (
            <p className="mt-1">
              <span className="font-semibold">{t('rejected.reasonLabel')}:</span>{' '}
              {application.rejectReason}
            </p>
          )}
          <p className="mt-1">{t('rejected.text')}</p>
        </div>
      )}

      <div className="rounded-card bg-surface p-[26px] shadow-card">
        <div className="flex flex-col gap-5">
          <div>
            <label
              htmlFor="ba-agency-name"
              className="mb-[7px] block text-[13px] font-bold"
            >
              {t('form.agencyName.label')}
            </label>
            <Field
              id="ba-agency-name"
              placeholder={t('form.agencyName.placeholder')}
              maxLength={AGENCY_NAME_MAX}
              value={agencyName}
              onChange={(e) => setAgencyName(e.target.value)}
            />
            <p className="mt-1.5 text-[12.5px] text-muted-foreground">
              {t('form.agencyName.hint')}
            </p>
          </div>
          <div>
            <label htmlFor="ba-about" className="mb-[7px] block text-[13px] font-bold">
              {t('form.about.label')}
            </label>
            <textarea
              id="ba-about"
              rows={6}
              className={cn(fieldClass, 'resize-y')}
              placeholder={t('form.about.placeholder')}
              maxLength={ABOUT_MAX}
              value={about}
              onChange={(e) => setAbout(e.target.value)}
            />
          </div>
          {(formError || submitErrorMessage) && (
            <p className="text-[13px] font-semibold text-red">
              {formError ?? submitErrorMessage}
            </p>
          )}
          <Button size="lg" disabled={submitting} onClick={handleSubmit}>
            {submitting
              ? t('form.submitting')
              : isResubmit
                ? t('form.resubmit')
                : t('form.submit')}
          </Button>
        </div>
      </div>
    </div>
  );
}
