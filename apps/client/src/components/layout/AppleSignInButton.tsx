/**
 * AppleSignInButton — кнопка Sign in with Apple (JS SDK, usePopup).
 * Инициализирует AppleID.auth, по клику открывает попап, шлёт id_token (+ имя
 * при первой авторизации) на /auth/apple через appleLogin. Рендерится только
 * если заданы NEXT_PUBLIC_APPLE_CLIENT_ID и NEXT_PUBLIC_APPLE_REDIRECT_URI.
 */
'use client';

import * as React from 'react';
import { useAppleLoginMutation } from '@/store/api/authApi';

interface AppleAuthResponse {
  authorization: { id_token: string; code: string; state?: string };
  user?: { name?: { firstName?: string; lastName?: string }; email?: string };
}
interface AppleIDAuth {
  init: (cfg: {
    clientId: string;
    scope: string;
    redirectURI: string;
    usePopup: boolean;
  }) => void;
  signIn: () => Promise<AppleAuthResponse>;
}
declare global {
  interface Window {
    AppleID?: { auth: AppleIDAuth };
  }
}

const APPLE_SRC =
  'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

export function AppleSignInButton({
  label,
  onSuccess,
}: {
  label: string;
  onSuccess?: () => void;
}) {
  const clientId = process.env.NEXT_PUBLIC_APPLE_CLIENT_ID;
  const redirectURI = process.env.NEXT_PUBLIC_APPLE_REDIRECT_URI;
  const [appleLogin] = useAppleLoginMutation();
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    if (!clientId || !redirectURI) return;

    const init = () => {
      if (!window.AppleID) return;
      window.AppleID.auth.init({
        clientId,
        scope: 'name email',
        redirectURI,
        usePopup: true,
      });
      setReady(true);
    };

    if (window.AppleID) {
      init();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${APPLE_SRC}"]`,
    );
    if (existing) {
      const onError = () => console.warn('Apple Sign-In SDK failed to load');
      existing.addEventListener('load', init);
      existing.addEventListener('error', onError);
      return () => {
        existing.removeEventListener('load', init);
        existing.removeEventListener('error', onError);
      };
    }
    const script = document.createElement('script');
    script.src = APPLE_SRC;
    script.async = true;
    script.defer = true;
    script.onload = init;
    script.onerror = () => {
      // SDK Apple не загрузился — кнопка останется disabled (вход через Apple недоступен).
      console.warn('Apple Sign-In SDK failed to load');
    };
    document.head.appendChild(script);
    return () => {
      script.onload = null;
      script.onerror = null;
    };
  }, [clientId, redirectURI]);

  const handleClick = async () => {
    if (!window.AppleID) return;
    try {
      const resp = await window.AppleID.auth.signIn();
      await appleLogin({
        id_token: resp.authorization.id_token,
        first_name: resp.user?.name?.firstName,
        last_name: resp.user?.name?.lastName,
      }).unwrap();
      onSuccess?.();
    } catch {
      /* отмена попапа или ошибка — показывает родитель/RTK */
    }
  };

  if (!clientId || !redirectURI) return null;
  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={!ready}
      className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-black text-[15px] font-medium text-white disabled:opacity-60"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 384 512"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
      </svg>
      {label}
    </button>
  );
}
