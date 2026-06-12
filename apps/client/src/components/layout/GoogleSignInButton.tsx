/**
 * GoogleSignInButton — официальная кнопка Google Identity Services (GIS).
 * Грузит gsi-скрипт, рендерит кнопку, в callback шлёт ID-token на /auth/google
 * через googleLogin. Рендерится только если задан NEXT_PUBLIC_GOOGLE_CLIENT_ID.
 */
'use client';

import * as React from 'react';
import { useGoogleLoginMutation } from '@/store/api/authApi';

interface GoogleIdConfig {
  client_id: string;
  callback: (resp: { credential: string }) => void;
}
interface GoogleButtonOptions {
  theme: string;
  size: string;
  width: number;
  text: string;
}
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: GoogleIdConfig) => void;
          renderButton: (el: HTMLElement, opts: GoogleButtonOptions) => void;
        };
      };
    };
  }
}

const GSI_SRC = 'https://accounts.google.com/gsi/client';

export function GoogleSignInButton({ onSuccess }: { onSuccess?: () => void }) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [googleLogin] = useGoogleLoginMutation();

  React.useEffect(() => {
    if (!clientId || !containerRef.current) return;

    const render = () => {
      if (!window.google || !containerRef.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (resp) => {
          void googleLogin({ id_token: resp.credential })
            .unwrap()
            .then(() => onSuccess?.())
            .catch(() => {
              /* ошибку показывает родитель/RTK */
            });
        },
      });
      window.google.accounts.id.renderButton(containerRef.current, {
        theme: 'outline',
        size: 'large',
        width: 356,
        text: 'continue_with',
      });
    };

    if (window.google) {
      render();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GSI_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener('load', render);
      return () => existing.removeEventListener('load', render);
    }
    const script = document.createElement('script');
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = render;
    document.head.appendChild(script);
  }, [clientId, googleLogin, onSuccess]);

  if (!clientId) return null;
  return <div ref={containerRef} className="mt-3 flex justify-center" />;
}
