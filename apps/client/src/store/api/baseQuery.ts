import { fetchBaseQuery } from '@reduxjs/toolkit/query/react';

/**
 * Базовый baseQuery публичного портала.
 *
 * Base URL всегда указывает на versioned API (`/api/v1`, CLAUDE.md §14).
 * Хост берётся из `NEXT_PUBLIC_API_BASE_URL`, по умолчанию — локальный api.
 *
 * Auth (Bearer + refresh-ротация) добавляется в TASK-150 вместе с authSlice;
 * сейчас это чистый baseQuery-фундамент.
 */
const API_BASE_URL = `${
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000'
}/api/v1`;

export const baseQuery = fetchBaseQuery({
  baseUrl: API_BASE_URL,
});
