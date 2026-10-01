import { Prisma } from '@prisma/client';

/**
 * SQL-нормализация адреса для сравнения: без учёта регистра и лишних пробелов
 * (ADR-0160). Один фрагмент на детекцию дубликатов в модерации и на импорт —
 * чтобы оба сравнивали адреса одинаково.
 */
export function normalizedAddressSql(expression: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`lower(regexp_replace(btrim(${expression}), '[[:space:]]+', ' ', 'g'))`;
}
