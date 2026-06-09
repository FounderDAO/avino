/**
 * Toast-уведомления админки. Провайдер держит текущее сообщение и автоскрытие
 * через 2.6с (как в прототипе). useToast() → showToast(msg). Рендерит плашку
 * fixed справа-снизу.
 */
'use client';

import * as React from 'react';

type ToastFn = (msg: string) => void;

const ToastContext = React.createContext<ToastFn | null>(null);

export function useToast(): ToastFn {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = React.useState<string | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = React.useCallback<ToastFn>((m) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 2600);
  }, []);

  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {msg && (
        <div
          className="fade-up"
          style={{
            position: 'fixed', right: 24, bottom: 24, zIndex: 95,
            background: 'var(--ink)', color: '#fff', borderRadius: 11,
            padding: '12px 18px', fontSize: 14, fontWeight: 600,
            boxShadow: 'var(--sh-raised)',
          }}
        >
          {msg}
        </div>
      )}
    </ToastContext.Provider>
  );
}
