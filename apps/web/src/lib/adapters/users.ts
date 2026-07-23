/**
 * Адаптеры: API DTO пользователей → UI-модель страниц админки (Цикл 3).
 *
 * Мок-тип `AdminUser` (lib/mock) узкий и не покрывает все роли API (нет
 * `PROPERTY_MANAGER`), а `role` там — единственная Capitalized-строка. Поэтому
 * здесь определяем UI-тип `UiAdminUser` поверх мок-формы: `role` храним кодом
 * `RoleCode` (рендер через {@link ROLE_LABEL}), плюс полный список `roles`
 * для отображения всех ролей в карточке. Вёрстка страниц не меняется — только
 * источник данных и типы.
 *
 * Чего нет в API (отдаём «—» с пометкой):
 * - `name` в списке `GET /admin/users` нет профиля → fallback email/phone/«—»;
 *   в карточке имя берём из профиля (`display_name` или `first_name+last_name`).
 * `listings` — счётчик `listings_count` из списка/карточки (без DELETED);
 * старый бэкенд поля не отдаёт → 0.
 */
import type { UserStatus } from '@/store/api/authApi';
import type {
  AdminUserDetail,
  AdminUserProfile,
  AdminUserRow,
  AuthType,
  RoleCode,
} from '@/store/api/adminTypes';

const DASH = '—';

/** UI-статус пользователя: активен / заблокирован / удалён (soft-delete). */
export type UiUserStatus = 'active' | 'blocked' | 'deleted';

/** RU-метка способа входа для колонки «Вход». */
export const AUTH_TYPE_LABEL: Record<AuthType, string> = {
  GOOGLE: 'Google',
  APPLE: 'Apple',
  SMS: 'SMS',
  EMAIL: 'Email',
};

/**
 * UI-модель строки/карточки пользователя для страниц админки. Совпадает с
 * мок-`AdminUser` по полям вёрстки, но `role` — код API (`RoleCode`), а `roles`
 * — полный список назначенных ролей (для карточки).
 */
export interface UiAdminUser {
  id: string;
  name: string;
  phone: string;
  email: string;
  role: RoleCode;
  roles: RoleCode[];
  listings: number;
  status: UiUserStatus;
  joined: string;
  verified: boolean;
  /** Способ последнего входа (из аудита); `null` — входов ещё не было. */
  authType: AuthType | null;
}

/** Имя из плоских полей списка: display_name → «first last» → null. */
function flatProfileName(r: AdminUserRow): string | null {
  if (r.display_name) return r.display_name;
  const full = [r.first_name, r.last_name].filter(Boolean).join(' ').trim();
  return full || null;
}

/** Человекочитаемая метка роли (RU) для всех кодов словаря `/roles`. */
export const ROLE_LABEL: Record<RoleCode, string> = {
  USER: 'Пользователь',
  OWNER: 'Собственник',
  AGENT: 'Агент',
  AGENCY: 'Агентство',
  LANDLORD: 'Арендодатель',
  PROPERTY_MANAGER: 'Управляющий',
  MODERATOR: 'Модератор',
  ADMIN: 'Администратор',
};

/** Метка роли по коду (fallback — сам код, если он вне словаря). */
export function roleLabel(code: RoleCode): string {
  return ROLE_LABEL[code] ?? code;
}

/** Список меток ролей (для отображения всех ролей пользователя в карточке). */
export function roleLabels(codes: RoleCode[]): string[] {
  return codes.map(roleLabel);
}

/**
 * Приоритет «значимости» роли — чтобы из набора кодов выбрать одну «главную»
 * для колонки «Роль» в списке (от привилегированной к базовой).
 */
const ROLE_PRIORITY: RoleCode[] = [
  'ADMIN',
  'MODERATOR',
  'AGENCY',
  'AGENT',
  'PROPERTY_MANAGER',
  'LANDLORD',
  'OWNER',
  'USER',
];

/** Первая «значимая» роль из набора кодов (fallback — `USER`). */
function primaryRole(codes: RoleCode[]): RoleCode {
  for (const code of ROLE_PRIORITY) {
    if (codes.includes(code)) return code;
  }
  return codes[0] ?? 'USER';
}

/**
 * API-статус пользователя → UI-статус. DELETED (soft-delete) — отдельное
 * состояние: раньше схлопывалось в «Заблокирован», из-за чего удалённые
 * аккаунты выглядели как заблокированные. ACTIVE→active, DELETED→deleted,
 * BLOCKED (и прочее) →blocked.
 */
export function apiToUiStatus(s: UserStatus): UiUserStatus {
  if (s === 'ACTIVE') return 'active';
  if (s === 'DELETED') return 'deleted';
  return 'blocked';
}

const dateFmt = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? DASH : dateFmt.format(d);
}

/** Имя из профиля карточки: display_name → first+last → null. */
function profileName(profile: AdminUserProfile | null): string | null {
  if (!profile) return null;
  const display = profile.display_name?.trim();
  if (display) return display;
  const full = [profile.first_name, profile.last_name]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(' ')
    .trim();
  return full || null;
}

/**
 * Строка списка `GET /admin/users` → UI-модель. Профиля в списке нет, поэтому
 * `name` = email → phone → «—».
 */
export function rowToAdminUser(r: AdminUserRow): UiAdminUser {
  return {
    id: r.id,
    name: flatProfileName(r) ?? r.email ?? r.phone ?? DASH,
    phone: r.phone ?? DASH,
    email: r.email ?? '',
    role: primaryRole(r.roles),
    roles: r.roles,
    listings: r.listings_count ?? 0,
    status: apiToUiStatus(r.status),
    joined: fmtDate(r.created_at),
    verified: r.is_email_verified || r.is_phone_verified,
    authType: r.auth_type ?? null,
  };
}

/**
 * Карточка `GET /admin/users/:id` → UI-модель. Имя — из профиля
 * (`display_name`/`first_name+last_name`), иначе email/phone/«—».
 */
export function detailToAdminUser(d: AdminUserDetail): UiAdminUser {
  const name = profileName(d.profile) ?? d.email ?? d.phone ?? DASH;
  return {
    id: d.id,
    name,
    phone: d.phone ?? DASH,
    email: d.email ?? '',
    role: primaryRole(d.roles),
    roles: d.roles,
    listings: d.listings_count ?? 0,
    status: apiToUiStatus(d.status),
    joined: fmtDate(d.created_at),
    verified: d.is_email_verified || d.is_phone_verified,
    authType: d.auth_type ?? null,
  };
}
