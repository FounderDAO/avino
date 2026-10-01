import { Prisma, UserStatus } from '@prisma/client';
import { UserRole } from '@avino/shared';
import { Db } from './import-duplicate.finder';
import { ImportRowError, ImportRowInput } from './import-row.validator';

export type OwnerLookup =
  | { kind: 'NEW' }
  | { kind: 'BLOCKED' }
  | { kind: 'EXISTING'; userId: string; firstName: string | null; lastName: string | null };

/** Владелец стал недоступен между классификацией и записью строки. */
export class OwnerUnavailableError extends Error {
  constructor(readonly rowError: ImportRowError) {
    super(rowError.code);
  }
}

const filled = (value: string | null | undefined): string | null => value?.trim() || null;

/** Только чтение: кто стоит за телефоном (спека 2026-10-02 §2). */
export async function lookupOwner(db: Db, phone: string): Promise<OwnerLookup> {
  const user = await db.user.findFirst({
    where: { phone, status: { not: UserStatus.DELETED } },
    select: {
      id: true,
      status: true,
      profile: { select: { firstName: true, lastName: true } },
    },
  });
  if (!user) return { kind: 'NEW' };
  if (user.status === UserStatus.BLOCKED) return { kind: 'BLOCKED' };
  return {
    kind: 'EXISTING',
    userId: user.id,
    firstName: filled(user.profile?.firstName),
    lastName: filled(user.profile?.lastName),
  };
}

/**
 * Можно ли привязать объявление к этому владельцу. Инвариант ADR-0125: у автора
 * объявления есть имя и фамилия — из профиля или из файла.
 */
export function ownerError(lookup: OwnerLookup, input: ImportRowInput): ImportRowError | null {
  if (lookup.kind === 'BLOCKED') {
    return { column: 'phone', code: 'OWNER_BLOCKED', message: 'Owner account is blocked' };
  }
  const firstName = lookup.kind === 'EXISTING' ? filled(lookup.firstName) ?? input.firstName : input.firstName;
  const lastName = lookup.kind === 'EXISTING' ? filled(lookup.lastName) ?? input.lastName : input.lastName;
  if (!firstName) {
    return { column: 'first_name', code: 'OWNER_NAME_REQUIRED', message: 'Owner first name is required' };
  }
  if (!lastName) {
    return { column: 'last_name', code: 'OWNER_NAME_REQUIRED', message: 'Owner last name is required' };
  }
  return null;
}

/**
 * Найти или создать владельца ВНУТРИ транзакции строки. Существующему
 * дозаполняются только пустые имя/фамилия. Новому: user (телефон не
 * подтверждён — станет подтверждённым при первом OTP-входе) + роль USER +
 * профиль. P2002 на телефоне не ловим здесь: Postgres уже оборвал транзакцию,
 * повтор строки делает вызывающий.
 */
export async function ensureOwner(
  tx: Prisma.TransactionClient,
  input: ImportRowInput,
): Promise<{ userId: string; isNew: boolean }> {
  const lookup = await lookupOwner(tx, input.phone);
  const problem = ownerError(lookup, input);
  if (problem) throw new OwnerUnavailableError(problem);

  if (lookup.kind === 'EXISTING') {
    if (!lookup.firstName || !lookup.lastName) {
      const firstName = lookup.firstName ?? input.firstName;
      const lastName = lookup.lastName ?? input.lastName;
      await tx.userProfile.upsert({
        where: { userId: lookup.userId },
        create: { userId: lookup.userId, firstName, lastName },
        update: { firstName, lastName },
      });
    }
    return { userId: lookup.userId, isNew: false };
  }

  const user = await tx.user.create({
    data: { phone: input.phone, isPhoneVerified: false },
    select: { id: true },
  });
  const role = await tx.role.findUnique({
    where: { code: UserRole.USER },
    select: { id: true },
  });
  if (role) {
    await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
  }
  await tx.userProfile.create({
    data: { userId: user.id, firstName: input.firstName, lastName: input.lastName },
  });
  return { userId: user.id, isNew: true };
}
