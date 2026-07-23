/**
 * Header — шапка публичного портала (перенос Header из chrome.jsx).
 * Sticky, высота --header-h, фон surface c blur, тень при скролле.
 * Десктоп: лого + навигация + LangSwitcher + избранное + профиль-меню
 *   (ProfileMenu) или «Войти» + «Разместить».
 * Мобайл: бургер → полноэкранное меню (залогинен — ссылки аккаунта + «Выйти»;
 *   гость — «Войти» открывает LoginModal).
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import { usePathname } from '@/i18n/navigation';
import { Heart, Menu, X, ChevronRight, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from './Logo';
import { LangSwitcher } from './LangSwitcher';
import { CurrencySwitcher } from './CurrencySwitcher';
import { LoginModal } from './LoginModal';
import { NAV_ITEMS } from './Nav';
import { Button } from '@/components/ui/button';
import { useFavoritesCount } from '@/store/favorites';
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated, selectCurrentUser } from '@/store/slices/authSlice';
import {
  ProfileMenu,
  PROFILE_MENU_LINKS,
  FAVORITE_MENU_LINKS,
  contactLabel,
} from './ProfileMenu';
import { BecomeAgentButton } from './BecomeAgentButton';
import { useLogout } from './useLogout';
import { UnreadIndicators } from './UnreadIndicators';
import { CountBadge } from '@/components/ui/count-badge';
import { useUnreadCounts } from '@/store/useUnreadCounts';
import { useUnreadSound } from '@/lib/useUnreadSound';
import { useRealtimeBridge } from '@/store/useRealtimeBridge';

/** Ряд мобильного меню: ссылка + опциональный аддон + шеврон. */
function MenuRow({
  href,
  label,
  active = false,
  trailing,
  onClick,
}: {
  href: string;
  label: string;
  active?: boolean;
  trailing?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'flex items-center justify-between gap-3 border-b border-border/60 py-3.5 text-[17px]',
        active ? 'font-bold text-red' : 'font-semibold text-ink',
      )}
    >
      <span className="truncate">{label}</span>
      <span className="flex shrink-0 items-center gap-2">
        {trailing}
        <ChevronRight size={18} className={active ? 'text-red' : 'text-muted-foreground'} />
      </span>
    </Link>
  );
}

/** Мелкий заголовок секции в мобильном меню. */
function MenuSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="pb-1 pt-5 text-[13px] font-bold text-muted-foreground">{children}</div>
  );
}

function HeaderBody({ searchParams }: { searchParams: URLSearchParams | null }) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const [scrolled, setScrolled] = React.useState(false);
  const [menu, setMenu] = React.useState(false);
  const [login, setLogin] = React.useState(false);
  const favCount = useFavoritesCount();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const currentUser = useAppSelector(selectCurrentUser);
  const { logout, isLoggingOut } = useLogout();

  // Идентичность для карточки мобильного меню (контакт, без имени — как в ProfileMenu).
  const contact = contactLabel(currentUser, t('account'));
  const avatarUrl = currentUser?.profile?.avatar_url ?? null;
  const avatarInitial = /^[\p{L}]/u.test(contact) ? contact[0].toUpperCase() : null;

  // Единый владелец фонового поллинга счётчиков (виден на всех страницах)
  // и звука при появлении нового непрочитанного.
  const {
    messages: unreadMessages,
    notifications: unreadNotifications,
    total: unreadTotal,
    ready: unreadReady,
  } = useUnreadCounts({ pollingInterval: 20000 });
  useUnreadSound(unreadTotal, unreadReady);
  // Единая точка монтирования realtime-моста (сокет→RTK invalidation, TASK-10).
  useRealtimeBridge();

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Закрываем мобильное меню при навигации.
  React.useEffect(() => {
    setMenu(false);
  }, [pathname]);

  // Лок скролла страницы, пока открыто мобильное меню (фон не двигается/не выглядывает).
  React.useEffect(() => {
    if (!menu) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menu]);

  const isActive = (key: string) => {
    if (key === 'sell') return pathname.startsWith('/sell');
    if (key === 'help') return pathname.startsWith('/help');
    if (pathname === '/search') {
      const tx = searchParams?.get('tx');
      const isNew = searchParams?.get('new_construction') === 'true';
      if (key === 'new') return tx === 'SALE' && isNew;
      if (key === 'sale') return tx === 'SALE' && !isNew;
      if (key === 'rent') return tx === 'RENT';
    }
    return false;
  };

  return (
    <header
      className={cn(
        'sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur-[10px] transition-shadow duration-200',
        scrolled && 'shadow-header',
      )}
    >
      <div
        className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-4 sm:px-6"
        style={{ height: 'var(--header-h)' }}
      >
        <div className="flex items-center gap-7">
          <Logo />
          <nav className="hidden items-center gap-[22px] md:flex">
            {NAV_ITEMS.map((n) => {
              const on = isActive(n.key);
              return (
                <Link
                  key={n.key}
                  href={n.href}
                  className={cn(
                    'relative py-1.5 text-[15px]',
                    on ? 'font-bold text-ink' : 'font-semibold text-muted-foreground hover:text-ink',
                  )}
                >
                  {t(n.labelKey)}
                  {on && (
                    <span className="absolute -bottom-1 left-0 right-0 h-[3px] rounded-[3px] bg-red" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Десктоп: действия */}
        <div className="hidden items-center gap-3 md:flex">
          <CurrencySwitcher />
          <LangSwitcher />
          <Link
            href="/account/favorites"
            aria-label={t('favorites')}
            className="relative flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-surface-2"
          >
            <Heart size={20} strokeWidth={1.9} />
            {favCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red px-1 text-[10px] font-bold text-white">
                {favCount}
              </span>
            )}
          </Link>
          {isAuthenticated ? (
            <>
              <UnreadIndicators
                messages={unreadMessages}
                notifications={unreadNotifications}
              />
              <ProfileMenu />
            </>
          ) : (
            <Button variant="ghost" onClick={() => setLogin(true)} className="text-[15px]">
              {t('login')}
            </Button>
          )}
          <BecomeAgentButton />
          <Button size="sm" asChild>
            <Link href="/sell">{t('postListing')}</Link>
          </Button>
        </div>

        {/* Мобайл: бургер */}
        <button
          type="button"
          aria-label={t('menu')}
          onClick={() => setMenu(true)}
          className="p-1.5 text-ink md:hidden"
        >
          <Menu size={26} />
        </button>
      </div>

      {/* Мобильное полноэкранное меню */}
      {menu && (
        <div className="fixed inset-0 z-[60] flex h-[100dvh] flex-col overflow-hidden bg-[linear-gradient(180deg,var(--surface)_0%,var(--background)_42%)] md:hidden">
          {/* Шапка меню */}
          <div
            className="flex shrink-0 items-center justify-between px-4"
            style={{ height: 'var(--header-h)' }}
          >
            <Logo />
            <button
              type="button"
              aria-label={t('close')}
              onClick={() => setMenu(false)}
              className="flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-surface-2"
            >
              <X size={26} />
            </button>
          </div>

          {/* Тело (скроллится) */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
            {isAuthenticated && (
              <div className="mb-4 flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-raised">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-mint text-base font-bold text-teal">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : avatarInitial ? (
                    avatarInitial
                  ) : (
                    <User size={22} strokeWidth={1.9} />
                  )}
                </span>
                <span className="truncate text-[15px] font-bold text-ink">{contact}</span>
              </div>
            )}

            <Button size="lg" asChild className="w-full">
              <Link href="/sell" onClick={() => setMenu(false)}>
                {t('postListingFull')}
              </Link>
            </Button>
            <BecomeAgentButton
              size="lg"
              className="mt-3 w-full"
              onClick={() => setMenu(false)}
              withHintText
            />

            <nav className="mt-4">
              {NAV_ITEMS.map((n) => (
                <MenuRow
                  key={n.key}
                  href={n.href}
                  label={t(n.labelKey)}
                  active={isActive(n.key)}
                  onClick={() => setMenu(false)}
                />
              ))}
            </nav>

            {isAuthenticated ? (
              <>
                <MenuSectionLabel>{t('profileMenu.sectionMain')}</MenuSectionLabel>
                {PROFILE_MENU_LINKS.map((it) => (
                  <MenuRow
                    key={it.key}
                    href={it.href}
                    label={t(it.labelKey)}
                    onClick={() => setMenu(false)}
                    trailing={
                      it.key === 'chat' ? (
                        <CountBadge count={unreadMessages} max={9} />
                      ) : undefined
                    }
                  />
                ))}
                <MenuSectionLabel>{t('profileMenu.favorites')}</MenuSectionLabel>
                {FAVORITE_MENU_LINKS.map((it) => (
                  <MenuRow
                    key={it.key}
                    href={it.href}
                    label={t(it.labelKey)}
                    onClick={() => setMenu(false)}
                    trailing={
                      it.key === 'favListings' && favCount > 0 ? (
                        <span className="text-[13px] font-bold text-muted-foreground">
                          {favCount}
                        </span>
                      ) : undefined
                    }
                  />
                ))}
              </>
            ) : (
              <Button
                size="lg"
                variant="outline"
                className="mt-4 w-full"
                onClick={() => {
                  setMenu(false);
                  setLogin(true);
                }}
              >
                {t('login')}
              </Button>
            )}
          </div>

          {/* Футер (закреплён): переключатели + «Выйти» */}
          <div className="shrink-0 border-t border-border bg-surface/70 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CurrencySwitcher />
                <LangSwitcher />
              </div>
              {isAuthenticated && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isLoggingOut}
                  onClick={() => {
                    setMenu(false);
                    void logout();
                  }}
                >
                  {t('logout')}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <LoginModal open={login} onOpenChange={setLogin} />
    </header>
  );
}

/** Изолирует useSearchParams (требует Suspense-границы при статической генерации). */
function HeaderWithSearchParams() {
  const searchParams = useSearchParams();
  return <HeaderBody searchParams={searchParams} />;
}

/**
 * Шапка портала. useSearchParams обёрнут в Suspense, чтобы статические страницы
 * (включая /_not-found) пререндерились без CSR-bailout. Fallback — тот же шелл
 * без подсветки на основе query (актуальна только на динамическом /search).
 */
export function Header() {
  return (
    <React.Suspense fallback={<HeaderBody searchParams={null} />}>
      <HeaderWithSearchParams />
    </React.Suspense>
  );
}
