/**
 * Тёмный сайдбар админки (порт Sidebar из scripts/admin.jsx).
 * Группы навигации, бейдж счётчика модерации, активный пункт через usePathname.
 * На мобильных — выезжающая панель (управляется из AdminShell).
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IC, type LucideIcon } from './icons';
import { useGetAdminStatsQuery } from '@/store/api/adminStatsApi';
import { useGetMeQuery } from '@/store/api/authApi';

type NavItem = [href: string, label: string, Icon: LucideIcon];

const NAV: { group: string; items: NavItem[] }[] = [
  { group: 'Обзор', items: [['/admin', 'Панель управления', IC.Building]] },
  {
    group: 'Контент',
    items: [
      ['/admin/listings', 'Объявления', IC.Home],
      ['/admin/moderation', 'Модерация', IC.Check],
      ['/admin/complaints', 'Жалобы', IC.Flag],
    ],
  },
  { group: 'Люди', items: [['/admin/users', 'Пользователи', IC.User]] },
  { group: 'Монетизация', items: [['/admin/promotions', 'Продвижение', IC.Sparkle]] },
  { group: 'Уведомления', items: [['/admin/broadcasts', 'Рассылки', IC.Megaphone]] },
  {
    group: 'Система',
    items: [
      ['/admin/logs', 'Логи', IC.ListIcon],
      ['/admin/settings', 'Настройки', IC.Sliders],
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(href + '/');
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  // Живые счётчики очереди модерации (NEW-листинги) и новых жалоб для бейджей —
  // те же источники, что KPI «На проверке» / «Жалобы» на дашборде;
  // инвалидируются после каждой модерации/обработки жалобы.
  const { data: stats } = useGetAdminStatsQuery();
  const moderationCount = stats?.listings_new ?? 0;
  const complaintsCount = stats?.complaints_new ?? 0;
  // Реальный пользователь в футере (раньше был зашит «Модератор admin@avino.uz»).
  const { data: me } = useGetMeQuery();
  const meName = me?.profile?.display_name || me?.email || me?.phone || '';
  return (
    <aside className={'a-side' + (open ? ' open' : '')}>
      <div className="a-side-head row" style={{ justifyContent: 'space-between' }}>
        <div className="row gap-12" style={{ gap: 10 }}>
          <span style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 11 12 4l8 7M6 9.5V20h12V9.5" />
              <path d="M10 20v-5h4v5" />
            </svg>
          </span>
          <span style={{ fontSize: 19, fontWeight: 900, letterSpacing: '-.04em', color: '#fff' }}>avino</span>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', color: 'var(--red)', background: 'rgba(224,60,66,.16)', padding: '3px 7px', borderRadius: 6 }}>ADMIN</span>
        </div>
        <button className="a-burger" onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.6)' }}>
          <IC.X size={22} />
        </button>
      </div>
      <div className="a-side-nav">
        {NAV.map((g) => (
          <div key={g.group}>
            <div className="a-navgroup">{g.group}</div>
            {g.items.map(([href, label, Icon]) => {
              const count =
                href === '/admin/moderation' ? moderationCount : href === '/admin/complaints' ? complaintsCount : 0;
              return (
                <Link key={href} href={href} className={'a-navitem' + (isActive(pathname, href) ? ' active' : '')} onClick={onClose}>
                  <Icon size={19} strokeWidth={1.9} /> {label}
                  {count ? <span className="badge-count">{count}</span> : null}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
      {me && (
        <div style={{ padding: 14, borderTop: '1px solid rgba(255,255,255,.1)' }}>
          <div className="row gap-12" style={{ gap: 10 }}>
            <span style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--teal)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 }}>
              {(meName[0] ?? '?').toUpperCase()}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: '#fff', fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meName}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me.email ?? me.phone ?? ''}</div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
