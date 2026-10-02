import { Prisma } from '@prisma/client';
import { normalizeAddress } from '../geo';
import { normalizedAddressSql } from '../listings/address-sql';
import { CreateListingDto } from '../listings/dto/create-listing.dto';
import { PrismaService } from '../prisma';

export type Db = PrismaService | Prisma.TransactionClient;

const decimalOrNull = (value: string | undefined): string | null =>
  value === undefined ? null : Number(value).toFixed(2);

/**
 * «Уже существует» (спека 2026-10-02 §3): у этого владельца есть не удалённое
 * объявление с тем же типом сделки, типом недвижимости, адресом, площадями и
 * этажом. Цена в ключ не входит. Адрес из файла сначала проходит тот же
 * `normalizeAddress`, что и при сохранении, иначе повторная загрузка файла не
 * нашла бы собственные объявления.
 */
export async function findOwnerDuplicate(
  db: Db,
  ownerId: string,
  dto: CreateListingDto,
): Promise<{ id: string; reference: number } | null> {
  if (!dto.address) return null;
  const address = normalizeAddress(dto.address);
  const rows = await db.$queryRaw<{ id: string; reference: number }[]>`
    SELECT id, reference
    FROM listings
    WHERE owner_id = ${ownerId}::uuid
      AND status::text <> 'DELETED'
      AND transaction_type::text = ${dto.transaction_type}
      AND property_type::text = ${dto.property_type}
      AND area IS NOT DISTINCT FROM ${decimalOrNull(dto.area)}::numeric
      AND lot_area IS NOT DISTINCT FROM ${decimalOrNull(dto.lot_area)}::numeric
      AND floor IS NOT DISTINCT FROM ${dto.floor ?? null}::int
      AND address IS NOT NULL
      AND ${normalizedAddressSql(Prisma.raw('address'))} =
          ${normalizedAddressSql(Prisma.sql`${address}`)}
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}
