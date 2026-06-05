"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";

import type { AppDispatch } from "@/store/store";
import { logOut, selectRefreshToken } from "@/store/slices/authSlice";
import { useLogoutMutation } from "@/store/api/authApi";

/**
 * useLogout (ADMIN-06) — единый выход из админки.
 *
 * 1. Гасит refresh-токен на бэкенде (POST /auth/logout), если он есть.
 * 2. Чистит локальное состояние (logOut: access из памяти + refresh из
 *    localStorage + user).
 * 3. Ведёт на страницу логина.
 *
 * Сетевые ошибки самого `/auth/logout` намеренно игнорируются — локальный
 * разлогин выполняется в любом случае, чтобы пользователь не «застрял»
 * залогиненным при недоступном бэкенде.
 */
export function useLogout(): () => Promise<void> {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const refreshToken = useSelector(selectRefreshToken);
  const [logoutRequest] = useLogoutMutation();

  return useCallback(async () => {
    try {
      if (refreshToken) {
        await logoutRequest({ refresh_token: refreshToken }).unwrap();
      }
    } catch {
      /* всё равно разлогиниваемся локально */
    } finally {
      dispatch(logOut());
      router.replace("/admin/login");
    }
  }, [dispatch, logoutRequest, refreshToken, router]);
}
