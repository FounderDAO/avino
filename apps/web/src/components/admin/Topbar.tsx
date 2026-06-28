/**
 * Верхняя панель админки (порт topbar из scripts/admin.jsx).
 * Бургер (открывает сайдбар на мобильных), заголовок раздела (из pathname),
 * глобальный поиск (desktop), колокол уведомлений.
 */
'use client';

import { usePathname } from 'next/navigation';
import { IC } from './icons';
import { IconButton } from './ui/button';
import { useToast } from './toast';
import { useGetMeQuery } from '@/store/api/authApi';
import { useLogout } from '@/hooks/useLogout';

const TITLES: Record<string, string> = {
  '/admin': 'Панель управления',
  '/admin/listings': 'Объявления',
  '/admin/moderation': 'Модерация',
  '/admin/agents': 'Агенты',
  '/admin/users': 'Пользователи',
  '/admin/promotions': 'Продвижение',
  '/admin/logs': 'Логи',
  '/admin/settings': 'Настройки',
};

function titleFor(pathname: string): string {
  if (TITLES[pathname]) return TITLES[pathname];
  if (pathname.startsWith('/admin/listings/')) return 'Объявление';
  if (pathname.startsWith('/admin/users/')) return 'Пользователь';
  return 'Avino Admin';
}

export function Topbar({ onBurger }: { onBurger: () => void }) {
  const pathname = usePathname();
  const toast = useToast();
  const { data: me } = useGetMeQuery();
  const logout = useLogout();
  return (
    <div className="a-topbar">
      <div className="row gap-12">
        <IconButton className="a-burger" onClick={onBurger}>
          <IC.Menu size={20} />
        </IconButton>
        <h2 style={{ fontSize: 19 }}>{titleFor(pathname)}</h2>
      </div>
      <div className="row gap-12">
        <div style={{ position: 'relative' }} className="max-[760px]:hidden flex">
          <IC.Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input
            className="a-field"
            style={{ paddingLeft: 36, width: 220 }}
            placeholder="Поиск…"
            onKeyDown={(e) => e.key === 'Enter' && toast('Глобальный поиск')}
          />
        </div>
        <IconButton onClick={() => toast('3 новых уведомления')} style={{ position: 'relative' }}>
          <IC.Bell size={19} strokeWidth={1.9} />
          <span style={{ position: 'absolute', top: 6, right: 7, width: 8, height: 8, borderRadius: '50%', background: 'var(--red)', border: '2px solid var(--surface)' }} />
        </IconButton>
        {me && (
          <div className="row gap-8" style={{ paddingLeft: 4 }}>
            <span
              className="max-[760px]:hidden"
              style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {me.profile?.display_name || me.email}
            </span>
            <IconButton onClick={logout} title="Выйти">
              <IC.LogOut size={19} />
            </IconButton>
          </div>
        )}
      </div>
    </div>
  );
}
