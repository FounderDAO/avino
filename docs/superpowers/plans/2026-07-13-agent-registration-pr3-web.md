# Agent Registration PR3 — админ-очередь заявок агентов (apps/web)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Страница «Заявки агентов» в админке: очередь заявок «Стать агентом» с фильтром по статусу, одобрением и отклонением (модалка с опциональной причиной).

**Architecture:** Третий (последний) PR фичи agent-registration (спека `docs/superpowers/specs/2026-07-12-agent-registration-design.md`, раздел 4; бэкенд уже в main — PR #383, API.md §21). Всё строго в `apps/web/`. RTK-слайс инъекцией в `adminApi` (тег `Admin`), адаптер DTO→row в `lib/adapters/`, страница по образцу `/admin/complaints`, пункт в сайдбаре в группе «Контент». Для адаптера ставится минимальный vitest-харнесс (в apps/web тестов ещё не было).

**Tech Stack:** Next.js 15 (app router, `'use client'`), RTK Query, lucide-react, vitest (новый dev-dep).

## Global Constraints

- **Только `apps/web/`** (плюс этот план и ADR в `docs/`). Файлы `apps/api`, `apps/client`, `packages/shared` не трогать (CLAUDE.md «Границы приложений»).
- **Субагенты НЕ трогают git.** Все `git`-шаги выполняет контроллер. Перед КАЖДЫМ коммитом проверять ветку: `rtk git status` → ветка `feat/agent-admin` (cron может переключить дерево на main).
- **Bash — через `rtk`** (`~/.claude/RTK.md`). Исключение: `next build` гонять raw `pnpm exec next build` (rtk-фильтр даёт ложный «Errors: 1»).
- **View snake_case / body camelCase**: ответы API — snake_case (`agency_name`, `reject_reason`, `avatar_url`), тела запросов — camelCase. В этом PR единственное тело — `{ reason }` (одно слово, регистр совпадает).
- **В apps/web НЕТ i18n** — все строки UI по-русски прямо в коде (как на остальных админ-страницах).
- **Никаких `fetch`/`axios` в компонентах** — только RTK Query через `adminApi.injectEndpoints` (CLAUDE.md §4).
- Кэш-тег: query `providesTags: ['Admin']`, мутации `invalidatesTags: ['Admin']` — список перечитывается после approve/reject.
- API-контракт — `docs/API.md` §21 (авторитетен при расхождениях):
  - `GET /api/v1/admin/agent-applications?status=&page=&limit=` → `{ data: [...], meta: { page, limit, total } }`; элемент: `{ id, status: PENDING|APPROVED|REJECTED, agency_name|null, about, reject_reason|null, moderator_id|null, created_at, resolved_at|null, user: { id, name|null, phone, avatar_url|null } }`.
  - `POST .../:id/approve` — без тела; 200 → тот же элемент. Ошибки: `404 NOT_FOUND`, `422 INVALID_STATUS_TRANSITION`.
  - `POST .../:id/reject` — тело `{ reason? }` (опционален, ≤2000 симв.); те же ответы/ошибки.
- `baseQuery` уже добавляет `/api/v1` — в слайсе URL начинается с `/admin/...` (как в `adminComplaintsApi`).

## File Structure

- Modify: `apps/web/src/store/api/adminTypes.ts` — DTO заявок (низ файла, секция-комментарий как у соседей).
- Create: `apps/web/src/store/api/adminAgentApplicationsApi.ts` — RTK-слайс (list/approve/reject).
- Create: `apps/web/vitest.config.mts` + Modify: `apps/web/package.json` — минимальный vitest-харнесс.
- Create: `apps/web/src/lib/adapters/agent-applications.ts` — адаптер DTO→row + карта статусов.
- Create: `apps/web/src/lib/adapters/agent-applications.test.ts` — тесты адаптера (TDD).
- Create: `apps/web/src/app/admin/agent-applications/page.tsx` — страница (таблица, чипы, пагинация, модалка отклонения).
- Modify: `apps/web/src/components/admin/icons.tsx` — иконка `UserCheck`.
- Modify: `apps/web/src/components/admin/Sidebar.tsx` — пункт «Заявки агентов» в группе «Контент».
- Modify: `docs/adr/ADR-0140-*.md` — абзац про админ-UI (расширение принятого решения, новый ADR не нужен).

Существующая `/admin/agents/page.tsx` — мок-сирота (нет в NAV), **не трогать**.

---

### Task 0: Ветка + коммит плана (контроллер, без субагента)

**Files:**
- Create: `docs/superpowers/plans/2026-07-13-agent-registration-pr3-web.md` (этот файл)
- Modify: `.superpowers/sdd/progress.md` (секция PR3)

- [ ] **Step 1: Свежий main и ветка**

```bash
rtk git status                      # убедиться: чистое дерево, ветка main
git checkout main && git pull --ff-only
git checkout -b feat/agent-admin
```

- [ ] **Step 2: Дописать секцию PR3 в `.superpowers/sdd/progress.md`** (Branch: feat/agent-admin, список задач Task 0–5, статусы pending).

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-07-13-agent-registration-pr3-web.md .superpowers/sdd/progress.md
git commit -m "docs(web): plan for agent applications admin queue (PR3)"
```

---

### Task 1: Типы + RTK-слайс

**Files:**
- Modify: `apps/web/src/store/api/adminTypes.ts` (в конец файла)
- Create: `apps/web/src/store/api/adminAgentApplicationsApi.ts`

**Interfaces:**
- Consumes: `adminApi` (`./adminApi`), `toQueryParams`/`Paginated`/`PageParams` (`./pagination`).
- Produces: типы `AgentApplication`, `AgentApplicationStatus`, `AgentApplicationUser`, `AgentApplicationFilters`; хуки `useListAdminAgentApplicationsQuery`, `useApproveAgentApplicationMutation`, `useRejectAgentApplicationMutation`. Сигнатуры мутаций: approve — arg `string` (id); reject — arg `{ id: string; reason?: string }`.

- [ ] **Step 1: Добавить DTO в `adminTypes.ts`** (после секции логов, перед «Параметры списков»; `AgentApplicationFilters` — в секцию параметров рядом с `ComplaintFilters`):

```ts
// ─── DTO: заявки агентов (API.md §21, ADR-0140) ─────────────────────────────

/** Статус заявки «Стать агентом» (PG enum `AgentApplicationStatus`, §21). */
export type AgentApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/**
 * Заявитель в админ-списке заявок (§21). `name` — display_name либо
 * «first last», иначе `null`; `avatar_url` резолвит бэкенд (ADR-0134).
 */
export interface AgentApplicationUser {
  id: string;
  name: string | null;
  phone: string | null;
  avatar_url: string | null;
}

/**
 * Заявка «Стать агентом» (`agent_applications`, §21) — элемент
 * `GET /admin/agent-applications` и ответ approve/reject.
 */
export interface AgentApplication {
  id: string;
  status: AgentApplicationStatus;
  /** `null` — частный маклер (без агентства). */
  agency_name: string | null;
  about: string;
  reject_reason: string | null;
  moderator_id: string | null;
  created_at: string;
  resolved_at: string | null;
  user: AgentApplicationUser;
}
```

и в секцию параметров списков:

```ts
/** `GET /admin/agent-applications` (§21). */
export interface AgentApplicationFilters extends PageParams {
  status?: AgentApplicationStatus;
}
```

- [ ] **Step 2: Создать `adminAgentApplicationsApi.ts`**:

```ts
import { adminApi } from './adminApi';
import { toQueryParams } from './pagination';
import type { Paginated } from './pagination';
import type { AgentApplication, AgentApplicationFilters } from './adminTypes';

/**
 * adminAgentApplicationsApi — заявки «Стать агентом» (API.md §21, ADR-0140).
 *
 * Инъекция в общий `adminApi` (CLAUDE.md §4: только RTK Query). Query помечен
 * тегом `Admin`; мутации инвалидируют `Admin` — список перечитывается после
 * решения по заявке.
 *
 * - `GET /admin/agent-applications?status&page&limit` → page-based
 *   `Paginated<AgentApplication>`. Auth: MODERATOR/ADMIN.
 * - `POST /admin/agent-applications/:id/approve` — без тела; транзакция на
 *   бэкенде выдаёт роль AGENT + уведомление заявителю.
 * - `POST /admin/agent-applications/:id/reject` `{ reason? }` — причина
 *   опциональна (≤2000 симв.); пустую строку не шлём.
 * Не-PENDING заявка → `422 INVALID_STATUS_TRANSITION` (§17).
 */
export const adminAgentApplicationsApi = adminApi.injectEndpoints({
  endpoints: (build) => ({
    listAdminAgentApplications: build.query<
      Paginated<AgentApplication>,
      AgentApplicationFilters
    >({
      query: (filters) => ({
        url: '/admin/agent-applications',
        params: toQueryParams({ ...filters }),
      }),
      providesTags: ['Admin'],
    }),

    approveAgentApplication: build.mutation<AgentApplication, string>({
      query: (id) => ({
        url: `/admin/agent-applications/${id}/approve`,
        method: 'POST',
      }),
      invalidatesTags: ['Admin'],
    }),

    rejectAgentApplication: build.mutation<
      AgentApplication,
      { id: string; reason?: string }
    >({
      query: ({ id, reason }) => ({
        url: `/admin/agent-applications/${id}/reject`,
        method: 'POST',
        body: reason && reason.trim() ? { reason: reason.trim() } : {},
      }),
      invalidatesTags: ['Admin'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useListAdminAgentApplicationsQuery,
  useApproveAgentApplicationMutation,
  useRejectAgentApplicationMutation,
} = adminAgentApplicationsApi;
```

- [ ] **Step 3: Проверка типов/сборки**

Run: `cd apps/web && pnpm exec next build` (raw — rtk-фильтр даёт ложную ошибку)
Expected: сборка зелёная, ошибок TS нет.

- [ ] **Step 4: Commit (контроллер)**

```bash
rtk git status   # ветка feat/agent-admin!
git add apps/web/src/store/api/adminTypes.ts apps/web/src/store/api/adminAgentApplicationsApi.ts
git commit -m "feat(web): agent applications RTK slice + DTO types"
```

---

### Task 2: Vitest-харнесс + адаптер (TDD)

**Files:**
- Create: `apps/web/vitest.config.mts`
- Modify: `apps/web/package.json` (test-скрипты + devDeps)
- Create: `apps/web/src/lib/adapters/agent-applications.test.ts`
- Create: `apps/web/src/lib/adapters/agent-applications.ts`

**Interfaces:**
- Consumes: типы `AgentApplication`, `AgentApplicationStatus` из Task 1.
- Produces: `AGENT_APPLICATION_STATUS_MAP: Record<AgentApplicationStatus, [label, color, bg]>`; `interface AgentApplicationRow { id; userId; userName; userPhone; avatarUrl: string | null; agency; about; status; rejectReason: string | null; created; resolved }` (все не отмеченные — `string`); `agentApplicationToRow(a: AgentApplication): AgentApplicationRow`.

- [ ] **Step 1: Установить dev-зависимости** (в apps/web тестов не было; jsdom/RTL не нужны — адаптер чистый):

```bash
rtk pnpm --filter @avino/web add -D vitest@^2 vite-tsconfig-paths@^5
```

- [ ] **Step 2: Создать `apps/web/vitest.config.mts`**:

```ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// Минимальный харнесс (пока только чистые модули — адаптеры): node-env,
// без jsdom/RTL. Компонентных тестов в apps/web ещё нет — появятся, добавим
// jsdom по образцу apps/client/vitest.config.mts.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globals: true,
  },
});
```

- [ ] **Step 3: Обновить скрипты в `apps/web/package.json`**:

```json
"test": "vitest run --passWithNoTests",
"test:watch": "vitest"
```

- [ ] **Step 4: Написать падающий тест `agent-applications.test.ts`**:

```ts
import { describe, expect, it } from 'vitest';
import type { AgentApplication } from '@/store/api/adminTypes';
import {
  AGENT_APPLICATION_STATUS_MAP,
  agentApplicationToRow,
} from './agent-applications';

const base: AgentApplication = {
  id: 'aa1',
  status: 'PENDING',
  agency_name: 'Ideal Estate',
  about: '10 лет на рынке',
  reject_reason: null,
  moderator_id: null,
  created_at: '2026-07-12T10:00:00Z',
  resolved_at: null,
  user: {
    id: 'u1',
    name: 'Алишер Усманов',
    phone: '+998901234567',
    avatar_url: 'https://cdn.avino.uz/u1.webp',
  },
};

describe('agentApplicationToRow', () => {
  it('маппит заполненную PENDING-заявку', () => {
    const row = agentApplicationToRow(base);
    expect(row).toEqual({
      id: 'aa1',
      userId: 'u1',
      userName: 'Алишер Усманов',
      userPhone: '+998901234567',
      avatarUrl: 'https://cdn.avino.uz/u1.webp',
      agency: 'Ideal Estate',
      about: '10 лет на рынке',
      status: 'PENDING',
      rejectReason: null,
      created: row.created,
      resolved: '—',
    });
    // Дата в ru-RU формате «дд.мм.гггг, чч:мм» (таймзона машины — проверяем шаблон).
    expect(row.created).toMatch(/^\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}$/);
  });

  it('null-поля: имя/телефон → «—», агентство → «Частный маклер», аватар null', () => {
    const row = agentApplicationToRow({
      ...base,
      agency_name: null,
      user: { id: 'u2', name: null, phone: null, avatar_url: null },
    });
    expect(row.userName).toBe('—');
    expect(row.userPhone).toBe('—');
    expect(row.agency).toBe('Частный маклер');
    expect(row.avatarUrl).toBeNull();
  });

  it('решённая заявка: resolved отформатирован, причина проброшена', () => {
    const row = agentApplicationToRow({
      ...base,
      status: 'REJECTED',
      reject_reason: 'Недостаточно данных',
      resolved_at: '2026-07-13T08:30:00Z',
    });
    expect(row.status).toBe('REJECTED');
    expect(row.rejectReason).toBe('Недостаточно данных');
    expect(row.resolved).toMatch(/^\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}$/);
  });

  it('невалидная дата → «—»', () => {
    const row = agentApplicationToRow({ ...base, created_at: 'not-a-date' });
    expect(row.created).toBe('—');
  });
});

describe('AGENT_APPLICATION_STATUS_MAP', () => {
  it('покрывает все статусы RU-метками', () => {
    expect(AGENT_APPLICATION_STATUS_MAP.PENDING[0]).toBe('Ожидает');
    expect(AGENT_APPLICATION_STATUS_MAP.APPROVED[0]).toBe('Одобрена');
    expect(AGENT_APPLICATION_STATUS_MAP.REJECTED[0]).toBe('Отклонена');
  });
});
```

- [ ] **Step 5: Убедиться, что тест падает**

Run: `rtk pnpm --filter @avino/web test`
Expected: FAIL — `Cannot find module './agent-applications'` (или эквивалент).

- [ ] **Step 6: Реализовать адаптер `agent-applications.ts`**:

```ts
/**
 * Адаптер заявок агентов: API-DTO `AgentApplication` (adminTypes) → UI-row
 * таблицы `/admin/agent-applications`. Паттерн — как `adapters/complaints.ts`:
 * даты форматируем в ru-RU, null-поля деградируют к «—», статус — RU-метка +
 * цвета пилла из дизайн-токенов (globals.css).
 */
import type {
  AgentApplication,
  AgentApplicationStatus,
} from '@/store/api/adminTypes';

const DASH = '—';

const dateTimeFmt = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** ISO → «дд.мм.гггг, чч:мм» (или «—» при null/невалидной дате). */
function fmtDate(iso: string | null): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? DASH : dateTimeFmt.format(d);
}

/** Статус заявки: `[RU-метка, цвет текста, фон]` для пилла. */
export const AGENT_APPLICATION_STATUS_MAP: Record<
  AgentApplicationStatus,
  [label: string, color: string, bg: string]
> = {
  PENDING: ['Ожидает', 'var(--warn)', 'var(--warn-bg)'],
  APPROVED: ['Одобрена', 'var(--green)', 'var(--green-bg)'],
  REJECTED: ['Отклонена', 'var(--muted)', 'var(--archive-bg)'],
};

/** Строка таблицы «Заявки агентов» (под реальную вёрстку). */
export interface AgentApplicationRow {
  id: string;
  /** Полный UUID заявителя — для ссылки на /admin/users/{id}. */
  userId: string;
  userName: string;
  userPhone: string;
  avatarUrl: string | null;
  /** `agency_name` либо «Частный маклер» (заявка без агентства). */
  agency: string;
  about: string;
  status: AgentApplicationStatus;
  rejectReason: string | null;
  created: string;
  resolved: string;
}

export function agentApplicationToRow(a: AgentApplication): AgentApplicationRow {
  return {
    id: a.id,
    userId: a.user.id,
    userName: a.user.name ?? DASH,
    userPhone: a.user.phone ?? DASH,
    avatarUrl: a.user.avatar_url,
    agency: a.agency_name ?? 'Частный маклер',
    about: a.about,
    status: a.status,
    rejectReason: a.reject_reason,
    created: fmtDate(a.created_at),
    resolved: fmtDate(a.resolved_at),
  };
}
```

- [ ] **Step 7: Тесты зелёные**

Run: `rtk pnpm --filter @avino/web test`
Expected: PASS, 5 тестов.

- [ ] **Step 8: Commit (контроллер)**

```bash
rtk git status   # ветка feat/agent-admin!
git add apps/web/vitest.config.mts apps/web/package.json pnpm-lock.yaml apps/web/src/lib/adapters/agent-applications.ts apps/web/src/lib/adapters/agent-applications.test.ts
git commit -m "feat(web): agent applications row adapter + vitest harness (TDD)"
```

---

### Task 3: Страница, модалка отклонения, навигация

**Files:**
- Create: `apps/web/src/app/admin/agent-applications/page.tsx`
- Modify: `apps/web/src/components/admin/icons.tsx` (добавить `UserCheck`)
- Modify: `apps/web/src/components/admin/Sidebar.tsx` (пункт NAV)

**Interfaces:**
- Consumes: хуки из Task 1 (`useListAdminAgentApplicationsQuery({ status?, page, limit })`, `useApproveAgentApplicationMutation()` — arg `string`, `useRejectAgentApplicationMutation()` — arg `{ id, reason? }`); адаптер из Task 2 (`agentApplicationToRow`, `AGENT_APPLICATION_STATUS_MAP`, тип `AgentApplicationRow`); `DEFAULT_LIMIT`, `totalPages` из `@/store/api/adminApi`; `getApiErrorCode` из `@/store/api/apiError`; `SectionTitle`, `Pill`, `IC`, `useToast`.
- Produces: роут `/admin/agent-applications`.

- [ ] **Step 1: Добавить иконку в `icons.tsx`** — в импорт из `lucide-react` добавить `UserCheck`, в объект `IC` добавить строку `UserCheck,` (алфавитно-смысловой порядок не enforced — положить рядом с `User`).

- [ ] **Step 2: Пункт в `Sidebar.tsx`** — в группу `Контент` после «Жалобы»:

```ts
['/admin/agent-applications', 'Заявки агентов', IC.UserCheck],
```

(Бейдж-счётчик не добавляем: в `GET /admin/stats` нет поля по заявкам агентов — расширение бэкенда вне границ этого PR.)

- [ ] **Step 3: Создать страницу `page.tsx`**:

```tsx
/**
 * Заявки агентов (ADR-0140, API.md §21) — очередь модерации заявок
 * «Стать агентом».
 *
 * GET /admin/agent-applications — фильтр по статусу (чипы, default PENDING),
 * серверная пагинация. Approve — сразу из строки (бэкенд транзакционно выдаёт
 * роль AGENT + уведомление); reject — модалка с опциональной причиной.
 * Мутации инвалидируют тег Admin → список перечитывается.
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { SectionTitle } from '@/components/admin/ui/section-title';
import { Pill } from '@/components/admin/ui/pill';
import { IC } from '@/components/admin/icons';
import { useToast } from '@/components/admin/toast';
import { DEFAULT_LIMIT, totalPages } from '@/store/api/adminApi';
import { getApiErrorCode } from '@/store/api/apiError';
import {
  useApproveAgentApplicationMutation,
  useListAdminAgentApplicationsQuery,
  useRejectAgentApplicationMutation,
} from '@/store/api/adminAgentApplicationsApi';
import type { AgentApplicationStatus } from '@/store/api/adminTypes';
import {
  AGENT_APPLICATION_STATUS_MAP,
  agentApplicationToRow,
} from '@/lib/adapters/agent-applications';
import type { AgentApplicationRow } from '@/lib/adapters/agent-applications';

type StatusFilter = 'ALL' | AgentApplicationStatus;

const statusFilters: [StatusFilter, string][] = [
  ['PENDING', 'Ожидают'],
  ['APPROVED', 'Одобренные'],
  ['REJECTED', 'Отклонённые'],
  ['ALL', 'Все'],
];

/** 422 INVALID_STATUS_TRANSITION → заявку уже решил другой модератор. */
function actionErrorMessage(err: unknown, fallback: string): string {
  const code = getApiErrorCode(err as Parameters<typeof getApiErrorCode>[0]);
  if (code === 'INVALID_STATUS_TRANSITION') return 'Заявка уже обработана';
  return fallback;
}

function RejectModal({
  row,
  busy,
  onConfirm,
  onClose,
}: {
  row: AgentApplicationRow;
  busy: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(26,26,26,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} className="fade-up a-card" style={{ width: '100%', maxWidth: 460, padding: 26, borderRadius: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
          <h2 style={{ fontSize: 22 }}>Отклонить заявку</h2>
          <button className="aicon-btn" style={{ width: 32, height: 32, border: 'none' }} onClick={onClose}><IC.X size={18} /></button>
        </div>
        <p className="muted" style={{ fontSize: 13.5, marginBottom: 14 }}>
          {row.userName} · {row.agency}
        </p>
        <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 6 }}>Причина (необязательно)</label>
        <textarea
          className="a-field"
          style={{ width: '100%', minHeight: 90, resize: 'vertical', marginBottom: 14 }}
          placeholder="Будет показана заявителю…"
          maxLength={2000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          autoFocus
        />
        <div className="row gap-10">
          <button className="abtn abtn-danger" style={{ flex: 1 }} disabled={busy} onClick={() => onConfirm(reason)}>
            {busy ? 'Отклонение…' : 'Отклонить'}
          </button>
          <button className="abtn abtn-outline" disabled={busy} onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>
  );
}

export default function AgentApplicationsPage() {
  const toast = useToast();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('PENDING');
  const [page, setPage] = useState(1);
  const [rejecting, setRejecting] = useState<AgentApplicationRow | null>(null);

  // Смена фильтра — на первую страницу.
  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const { data, isLoading, isFetching, isError, refetch } =
    useListAdminAgentApplicationsQuery({
      status: statusFilter === 'ALL' ? undefined : statusFilter,
      page,
      limit: DEFAULT_LIMIT,
    });

  const [approve, { isLoading: isApproving }] = useApproveAgentApplicationMutation();
  const [reject, { isLoading: isRejecting }] = useRejectAgentApplicationMutation();
  const busy = isApproving || isRejecting;

  const rows = (data?.data ?? []).map(agentApplicationToRow);
  const total = data?.meta.total ?? 0;
  const pages = totalPages(data?.meta);

  const onApprove = async (id: string) => {
    try {
      await approve(id).unwrap();
      toast('Заявка одобрена — роль агента выдана');
    } catch (err) {
      toast(actionErrorMessage(err, 'Не удалось одобрить заявку'));
    }
  };

  const onReject = async (id: string, reason: string) => {
    try {
      await reject({ id, reason: reason.trim() || undefined }).unwrap();
      toast('Заявка отклонена');
      setRejecting(null);
    } catch (err) {
      toast(actionErrorMessage(err, 'Не удалось отклонить заявку'));
      setRejecting(null);
    }
  };

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <SectionTitle sub={`${total} заявок всего`}>Заявки агентов</SectionTitle>
      </div>
      <div className="row gap-8" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        {statusFilters.map(([k, v]) => (
          <button key={k} onClick={() => setStatusFilter(k)} className="abtn abtn-sm" style={{ background: statusFilter === k ? 'var(--ink)' : 'var(--surface)', color: statusFilter === k ? '#fff' : 'var(--ink)', border: statusFilter === k ? 'none' : '1.5px solid var(--border)' }}>{v}</button>
        ))}
      </div>
      {isError ? (
        <div className="a-card" style={{ padding: 40, textAlign: 'center' }}>
          <p className="muted" style={{ marginBottom: 14 }}>Не удалось загрузить заявки.</p>
          <button className="abtn abtn-outline" onClick={() => refetch()}>Повторить</button>
        </div>
      ) : (
        <div className="a-card table-scroll">
          <table className="a-table">
            <thead><tr><th>Заявитель</th><th>Агентство</th><th>О себе</th><th>Подана</th><th>Статус</th><th></th></tr></thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 40 }}>Загрузка…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 40 }}>Заявок нет — очередь чиста.</td></tr>
              ) : (
                rows.map((r) => {
                  const [label, color, bg] = AGENT_APPLICATION_STATUS_MAP[r.status];
                  return (
                    <tr key={r.id}>
                      <td>
                        <Link href={`/admin/users/${r.userId}`} className="row gap-10" style={{ alignItems: 'center', color: 'inherit', textDecoration: 'none' }}>
                          {r.avatarUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={r.avatarUrl} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                          ) : (
                            <span style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--mint)', color: 'var(--teal-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, flexShrink: 0 }}>
                              {(r.userName[0] ?? '?').toUpperCase()}
                            </span>
                          )}
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: 'block', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.userName}</span>
                            <span className="muted mono" style={{ display: 'block', fontSize: 12.5, whiteSpace: 'nowrap' }}>{r.userPhone}</span>
                          </span>
                        </Link>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{r.agency}</td>
                      <td style={{ maxWidth: 320 }}>
                        <div className="muted" style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.about}>{r.about}</div>
                      </td>
                      <td className="muted" style={{ whiteSpace: 'nowrap' }}>{r.created}</td>
                      <td>
                        <Pill bg={bg} color={color}>{label}</Pill>
                        {r.status !== 'PENDING' && (
                          <div className="muted" style={{ fontSize: 12, marginTop: 4, whiteSpace: 'nowrap' }}>{r.resolved}</div>
                        )}
                        {r.status === 'REJECTED' && r.rejectReason && (
                          <div className="muted" style={{ fontSize: 12, marginTop: 2, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.rejectReason}>{r.rejectReason}</div>
                        )}
                      </td>
                      <td>
                        {r.status === 'PENDING' && (
                          <div className="row gap-6" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            <button className="abtn abtn-ok abtn-sm" disabled={busy} onClick={() => onApprove(r.id)}><IC.Check size={15} /> Одобрить</button>
                            <button className="abtn abtn-danger abtn-sm" disabled={busy} onClick={() => setRejecting(r)}><IC.X size={15} /> Отклонить</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 14, fontSize: 13.5, color: 'var(--muted)' }}>
        <span>{isFetching ? 'Обновление…' : `Показано ${rows.length} из ${total}`}</span>
        <div className="row gap-4">
          <button className="aicon-btn" style={{ width: 32, height: 32 }} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><IC.ChevronLeft size={16} /></button>
          <button className="abtn abtn-sm" style={{ background: 'var(--ink)', color: '#fff' }}>{page}</button>
          <button className="aicon-btn" style={{ width: 32, height: 32 }} disabled={pages > 0 && page >= pages} onClick={() => setPage((p) => p + 1)}><IC.ChevronRight size={16} /></button>
        </div>
      </div>
      {rejecting && (
        <RejectModal
          row={rejecting}
          busy={isRejecting}
          onConfirm={(reason) => onReject(rejecting.id, reason)}
          onClose={() => setRejecting(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Проверки**

Run: `rtk pnpm --filter @avino/web lint` → чисто.
Run: `cd apps/web && pnpm exec next build` (raw) → зелёная сборка, роут `/admin/agent-applications` в выводе.
Run: `rtk pnpm --filter @avino/web test` → 5 тестов зелёные (регрессий нет).

- [ ] **Step 5: Commit (контроллер)**

```bash
rtk git status   # ветка feat/agent-admin!
git add apps/web/src/app/admin/agent-applications/page.tsx apps/web/src/components/admin/icons.tsx apps/web/src/components/admin/Sidebar.tsx
git commit -m "feat(web): agent applications admin queue page + nav"
```

---

### Task 4: Обновить ADR-0140 (docs)

**Files:**
- Modify: `docs/adr/ADR-0140-*.md` (точное имя — `rtk ls docs/adr | rtk grep 0140`)

- [ ] **Step 1:** В ADR-0140 (решение по фиче agent-registration, принят в PR1) дополнить раздел Consequences/Related files: админ-очередь `/admin/agent-applications` в apps/web (RTK-слайс `adminAgentApplicationsApi`, адаптер, страница; approve/reject из UI). Новый ADR не создавать — это расширение принятого решения (CLAUDE.md, «When existing ADR can be updated»).

- [ ] **Step 2: Commit (контроллер)**

```bash
rtk git status   # ветка feat/agent-admin!
git add docs/adr/ADR-0140-*.md
git commit -m "docs(adr): ADR-0140 — admin queue UI for agent applications"
```

---

### Task 5: Финальные ворота (контроллер): ревью, live-verify, PR

**Files:** нет новых (фиксы по ревью — точечно).

- [ ] **Step 1: Полные проверки**

```bash
rtk pnpm --filter @avino/web lint
rtk pnpm --filter @avino/web test
cd apps/web && pnpm exec next build   # raw
```
Expected: всё зелёное.

- [ ] **Step 2: Финальное ревью ветки (Opus-субагент)** — диф `main..feat/agent-admin` против спеки (раздел 4) и API.md §21. Findings чинить и перепроверять до Approved.

- [ ] **Step 3: Live-verify** (стандартный рецепт из `.superpowers/sdd/progress.md` / памяти):
  1. Поднять стек (`docker compose` staging-профиль как в PR1/PR2), пересобрать web на код ветки.
  2. Bypass-юзер `+998902793100`: в БД разблокировать (status `ACTIVE`) и выдать роль `ADMIN`.
  3. Тестовый заявитель: обычный юзер, подать заявку через API (`POST /users/me/agent-application`, OTP dev-код из логов api).
  4. UI: `/admin/agent-applications` — заявка в очереди (default PENDING, аватар/имя/телефон/агентство/«о себе»/дата), «Одобрить» → toast, заявка уходит из PENDING-фильтра, роль AGENT у заявителя выдана (проверить `/admin/users/[id]` или API), уведомление создано.
  5. Второй заявитель → «Отклонить» с причиной → статус REJECTED, причина видна в фильтре «Отклонённые» и в `GET /users/me/agent-application` заявителя.
  6. Проверить фильтры/пагинацию и пункт в сайдбаре.
  7. **Откат тестовых данных:** удалить тестовые заявки/роли/уведомления, bypass-юзера вернуть в `BLOCKED` и снять ADMIN.

- [ ] **Step 4: Push + PR** (мёржит юзер; `--admin` запрещён):

```bash
rtk git status   # ветка feat/agent-admin, всё закоммичено
git push -u origin feat/agent-admin
gh pr create --title "feat(web): agent applications admin queue (PR3)" --body "..."
```

PR body: что сделано (страница/слайс/адаптер/vitest-харнесс/nav/ADR), как проверить (live-verify сценарий), ссылка на спеку и PR #383/#384.

- [ ] **Step 5:** Обновить `.superpowers/sdd/progress.md` (леджер PR3 complete, номер PR).

---

## Self-Review

- **Spec coverage:** раздел 4 спеки — таблица (заявитель с аватаром/телефоном ✓, агентство ✓, «о себе» ✓, дата ✓, статус ✓), фильтр по статусу default PENDING ✓, пагинация ✓, «Одобрить» ✓, «Отклонить» с модалкой и опциональной причиной ✓, паттерн complaints ✓, гоча snake/camel учтена ✓, nav-пункт ✓. Бейдж-счётчик сайдбара — осознанно вне объёма (нет поля в /admin/stats, бэкенд вне границ PR).
- **Placeholders:** нет — весь код приведён.
- **Type consistency:** `AgentApplicationRow` (Task 2) ↔ использование в Task 3 сверены; хуки Task 1 ↔ импорты Task 3 сверены; `getApiErrorCode` существует в `apiError.ts`.
