/**
 * ContactCard — карточка контакта автора объявления (sticky-сайдбар detail).
 * Перенос ContactCard из claudeDesign/detail.jsx на токены проекта.
 * Кнопки: «Показать телефон» (раскрывает номер из мока), «Написать» (заглушка).
 * Избранное и «Поделиться» вынесены в шапку деталки/модалки (см. Detail.tsx);
 * ShareModal остаётся во владельческом виде.
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useRouter, Link } from '@/i18n/navigation';
import { CalendarDays, MessageSquare, Phone, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoginModal } from '@/components/layout/LoginModal';
import { TourRequestModal } from './TourRequestModal';
import { ShareModal } from './ShareButton';
import type { Listing } from '@/lib/mock/types';
import { useAppSelector } from '@/store/hooks';
import { selectCurrentUser, selectIsAuthenticated } from '@/store/slices/authSlice';
import { useCreateThreadMutation } from '@/store/api/chatApi';
import { useRegisterListingCallMutation } from '@/store/api/listingEditApi';
import { getApiError } from '@/store/api/apiError';

export interface ContactCardProps {
  listing: Listing;
  className?: string;
}

export function ContactCard({ listing, className }: ContactCardProps) {
  const { agent } = listing;
  const t = useTranslations('listing');
  const router = useRouter();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const currentUser = useAppSelector(selectCurrentUser);
  // Владелец, открывший своё объявление, видит управление вместо контактов/чата.
  const isOwner =
    isAuthenticated &&
    Boolean(currentUser?.id) &&
    currentUser?.id === listing.ownerId;
  const [createThread, { isLoading: isCreatingThread }] = useCreateThreadMutation();
  const [registerCall] = useRegisterListingCallMutation();
  const [chatError, setChatError] = React.useState<string | null>(null);
  // Раскрытие телефона по клику (как в прототипе — номер из мока).
  const [phoneShown, setPhoneShown] = React.useState(false);
  // Модалка входа для гостя + «отложенное намерение» написать после входа.
  const [loginOpen, setLoginOpen] = React.useState(false);
  const [pendingMessage, setPendingMessage] = React.useState(false);
  // Тур: модалка + отложенное намерение для гостя.
  const [tourOpen, setTourOpen] = React.useState(false);
  const [pendingTour, setPendingTour] = React.useState(false);
  // Модалка «Поделиться» — общий ShareModal (как у кнопки-иконки наверху страницы).
  const [shareOpen, setShareOpen] = React.useState(false);
  const canTour =
    listing.toursEnabled === true &&
    (listing.status ?? 'ACTIVE') === 'ACTIVE' &&
    (listing.tourWindows?.length ?? 0) > 0;

  // Создаёт (идемпотентно) диалог по объявлению и переходит в инбокс.
  const createThreadAndGo = React.useCallback(async () => {
    setChatError(null);
    try {
      await createThread({
        listing_id: listing.id,
        // Дефолтное приветствие при создании диалога из карточки контакта.
        body: t('contact.greeting'),
      }).unwrap();
      router.push('/account/inbox');
    } catch (err) {
      const apiErr = getApiError(err as Parameters<typeof getApiError>[0]);
      setChatError(apiErr?.message ?? t('contact.chatError'));
    }
  }, [createThread, listing.id, router, t]);

  // «Написать»: гость → открываем модалку входа (не редиректим на главную) и
  // запоминаем намерение; авторизован → сразу создаём диалог.
  const handleMessage = React.useCallback(() => {
    if (!isAuthenticated) {
      setPendingMessage(true);
      setLoginOpen(true);
      return;
    }
    void createThreadAndGo();
  }, [isAuthenticated, createThreadAndGo]);

  // После успешного входа из карточки — продолжаем отложенное намерение «Написать».
  React.useEffect(() => {
    if (isAuthenticated && pendingMessage) {
      setPendingMessage(false);
      void createThreadAndGo();
    }
  }, [isAuthenticated, pendingMessage, createThreadAndGo]);

  // «Запросить тур»: гость → логин + запомнить намерение; авторизован → открыть модалку.
  const handleTour = React.useCallback(() => {
    if (!isAuthenticated) { setPendingTour(true); setLoginOpen(true); return; }
    setTourOpen(true);
  }, [isAuthenticated]);

  // После входа гостя — продолжаем намерение «тур».
  React.useEffect(() => {
    if (isAuthenticated && pendingTour) { setPendingTour(false); setTourOpen(true); }
  }, [isAuthenticated, pendingTour]);

  // Владельческий вид: плашка + управление (редактирование / мои объявления),
  // вместо «показать телефон / написать». ShareModal оставляем — полезно и владельцу.
  if (isOwner) {
    return (
      <div className={'rounded-card border border-border bg-surface p-5 shadow-card ' + (className ?? '')}>
        <div className="text-base font-bold text-ink">{t('contact.ownerNotice')}</div>
        <div className="mt-4 flex flex-col gap-2.5">
          <Button asChild size="lg" className="w-full">
            <Link href={`/sell/${listing.id}/edit`}>{t('contact.editListing')}</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="w-full">
            <Link href="/account/my-listings">{t('contact.manageListings')}</Link>
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            onClick={() => setShareOpen(true)}
          >
            <Share2 size={17} /> {t('contact.share')}
          </Button>
        </div>
        {shareOpen && (
          <ShareModal listing={listing} open={shareOpen} onOpenChange={setShareOpen} />
        )}
      </div>
    );
  }

  return (
    <div className={'rounded-card border border-border bg-surface p-5 shadow-card ' + (className ?? '')}>
      {/* Шапка: аватар-инициал + имя + статус */}
      <div className="flex items-center gap-3">
        <div className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-full bg-mint text-[19px] font-extrabold text-teal-deep">
          {agent.name.trim()[0]?.toUpperCase() ?? '·'}
        </div>
        <div className="min-w-0">
          <div className="truncate text-base font-bold">{agent.name}</div>
          <div className="mt-0.5">
            {agent.pro ? (
              <span className="inline-block rounded-badge bg-mint px-2.5 py-1 text-[11.5px] font-extrabold text-teal-deep">
                {t('contact.proBadge')}
              </span>
            ) : (
              <span className="text-[13px] text-muted-foreground">{t('contact.owner')}</span>
            )}
          </div>
        </div>
      </div>

      {/* Кнопки связи */}
      <div className="mt-5 flex flex-col gap-2.5">
        {/* «Показать телефон» показываем только когда телефон реально есть —
            иначе кнопка была бы «мёртвой» (owner без contact_phone). */}
        {agent.phone &&
          (phoneShown ? (
            <a
              href={`tel:${agent.phone.replace(/\s/g, '')}`}
              className="inline-flex w-full items-center justify-center gap-2 rounded-pill bg-ink px-7 py-4 text-base font-bold tracking-[-0.01em] text-white transition-colors hover:bg-black"
              onClick={() => {
                // Намерение позвонить (спека 2026-07-03). Не ждём ответа и не
                // блокируем набор номера; 404/сеть — глотаем.
                void registerCall(listing.id)
                  .unwrap()
                  .catch(() => {});
              }}
            >
              <Phone size={18} /> {agent.phone}
            </a>
          ) : (
            <Button size="lg" className="w-full" onClick={() => setPhoneShown(true)}>
              <Phone size={18} /> {t('contact.showPhone')}
            </Button>
          ))}

        {canTour && (
          <Button size="lg" className="w-full" onClick={handleTour}>
            <CalendarDays size={18} /> {t('contact.requestTour')}
          </Button>
        )}

        <Button
          variant="outline"
          size="lg"
          className="w-full"
          disabled={isCreatingThread}
          onClick={handleMessage}
        >
          <MessageSquare size={18} /> {t('contact.message')}
        </Button>
        {chatError && <div className="text-[12.5px] text-red">{chatError}</div>}
      </div>

      {/* Вход гостя при попытке написать продавцу. */}
      <LoginModal
        open={loginOpen}
        onOpenChange={setLoginOpen}
        context={t('contact.loginToMessage')}
      />
      <TourRequestModal listing={listing} open={tourOpen} onOpenChange={setTourOpen} />
      {/* Условный рендер: при закрытой модалке не дёргаем usePriceFormatter/курс. */}
      {shareOpen && (
        <ShareModal listing={listing} open={shareOpen} onOpenChange={setShareOpen} />
      )}
    </div>
  );
}
