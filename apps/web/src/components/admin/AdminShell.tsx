/**
 * Оболочка админки: сайдбар + основная колонка (топбар + контент).
 * Держит состояние мобильного выезжающего сайдбара (scrim + open).
 * Порт раскладки AdminApp из scripts/admin.jsx (без внутреннего роутера —
 * маршрутизация на Next App Router).
 */
'use client';

import * as React from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="admin">
      {open && <div className="a-scrim" onClick={() => setOpen(false)} />}
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="a-main">
        <Topbar onBurger={() => setOpen(true)} />
        <div className="a-content">{children}</div>
      </div>
    </div>
  );
}
