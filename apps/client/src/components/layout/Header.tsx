/**
 * Header — шапка публичного портала (перенос Header из chrome.jsx).
 * Sticky, высота --header-h, фон surface c blur, тень при скролле.
 * Десктоп: лого + навигация + LangSwitcher + избранное + «Войти» + «Разместить».
 * Мобайл: бургер → полноэкранное меню. «Войти» открывает LoginModal-заглушку.
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import { usePathname, useRouter } from '@/i18n/navigation';
import { Heart, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from './Logo';
import { LangSwitcher } from './LangSwitcher';
import { CurrencySwitcher } from './CurrencySwitcher';
import { LoginModal } from './LoginModal';
import { NAV_ITEMS } from './Nav';
import { Button } from '@/components/ui/button';
import { useFavoritesCount } from '@/store/favorites';
import { useAppSelector } from '@/store/hooks';
import {
  selectIsAuthenticated,
  selectCurrentUser,
  selectRefreshToken,
} from '@/store/slices/authSlice';
import { useLogoutMutation } from '@/store/api/authApi';

function HeaderBody({ searchParams }: { searchParams: URLSearchParams | null }) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const router = useRouter();
  const [scrolled, setScrolled] = React.useState(false);
  const [menu, setMenu] = React.useState(false);
  const [login, setLogin] = React.useState(false);
  const favCount = useFavoritesCount();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const currentUser = useAppSelector(selectCurrentUser);
  const refreshToken = useAppSelector(selectRefreshToken);
  const [logout, { isLoading: isLoggingOut }] = useLogoutMutation();

  // Имя для подписи аккаунта (display_name → имя → телефон → запасной текст).
  const accountLabel =
    currentUser?.profile?.display_name ??
    currentUser?.profile?.first_name ??
    currentUser?.phone ??
    t('account');

  const handleLogout = React.useCallback(async () => {
    // clearCredentials вызывается в onQueryStarted независимо от исхода.
    try {
      await logout({ refresh_token: refreshToken ?? '' });
    } finally {
      // После выхода уводим с приватных страниц аккаунта на главную.
      router.push('/');
    }
  }, [logout, refreshToken, router]);

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

  const isActive = (key: string) => {
    if (key === 'sell') return pathname.startsWith('/sell');
    if (key === 'help') return pathname.startsWith('/help');
    if (key === 'map') return pathname.startsWith('/map');
    if (pathname === '/search') {
      const tx = searchParams?.get('tx');
      const isNew = searchParams?.get('type') === 'NEW_BUILDING';
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
              <Button variant="ghost" asChild className="text-[15px]">
                <Link href="/account/profile">{accountLabel}</Link>
              </Button>
              <Button
                variant="ghost"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="text-[15px]"
              >
                {t('logout')}
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => setLogin(true)} className="text-[15px]">
              {t('login')}
            </Button>
          )}
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
        <div className="fixed inset-0 z-[60] flex flex-col bg-background md:hidden">
          <div
            className="mx-auto flex w-full max-w-[1280px] items-center justify-between px-4"
            style={{ height: 'var(--header-h)' }}
          >
            <Logo />
            <button type="button" aria-label={t('close')} onClick={() => setMenu(false)} className="p-1.5">
              <X size={26} />
            </button>
          </div>
          <div className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col gap-1 px-4 pt-3">
            {NAV_ITEMS.map((n) => (
              <Link
                key={n.key}
                href={n.href}
                className="border-b border-border py-4 text-[22px] font-extrabold text-ink"
              >
                {t(n.labelKey)}
              </Link>
            ))}
            <div className="mt-6 flex flex-col gap-3">
              <Button size="lg" asChild>
                <Link href="/sell">{t('postListingFull')}</Link>
              </Button>
              {isAuthenticated ? (
                <>
                  <Button size="lg" variant="outline" asChild>
                    <Link href="/account/profile">{accountLabel}</Link>
                  </Button>
                  <Button
                    size="lg"
                    variant="ghost"
                    disabled={isLoggingOut}
                    onClick={() => {
                      setMenu(false);
                      handleLogout();
                    }}
                  >
                    {t('logout')}
                  </Button>
                </>
              ) : (
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => {
                    setMenu(false);
                    setLogin(true);
                  }}
                >
                  {t('login')}
                </Button>
              )}
              <div className="mt-2 flex items-center gap-3">
                <CurrencySwitcher />
                <LangSwitcher />
              </div>
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
