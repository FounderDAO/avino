import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { PrismaService } from '../prisma';
import { CreateAmenityDto } from './dto/create-amenity.dto';
import { UpdateAmenityDto } from './dto/update-amenity.dto';

/** Удобство в контракте API (snake_case). */
export interface AmenityResponse {
  id: string;
  code: string;
  label_ru: string;
  label_uz: string;
  label_en: string;
  is_active: boolean;
  sort_order: number;
}

const SELECT = {
  id: true, code: true, labelRu: true, labelUz: true,
  labelEn: true, isActive: true, sortOrder: true,
} as const;

type AmenityRow = Prisma.AmenityGetPayload<{ select: typeof SELECT }>;

const ORDER: Prisma.AmenityOrderByWithRelationInput[] = [
  { sortOrder: 'asc' }, { code: 'asc' },
];

/** `Video surveillance` → `VIDEO_SURVEILLANCE`; отбрасывает пустые сегменты. */
export function slugifyCode(labelEn: string): string {
  return labelEn
    .trim().toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * AmenitiesService — справочник удобств (ADR-0111 → таблица).
 * Публичный список (активные) для форм/фильтров, admin CRUD (create/update).
 * Soft-delete-only: скрытие через is_active, жёсткого delete нет.
 */
@Injectable()
export class AmenitiesService {
  constructor(private readonly prisma: PrismaService) {}

  listActive(): Promise<AmenityResponse[]> {
    return this.query({ isActive: true });
  }

  listAll(): Promise<AmenityResponse[]> {
    return this.query({});
  }

  async create(dto: CreateAmenityDto): Promise<AmenityResponse> {
    const code = dto.code ?? slugifyCode(dto.label_en);
    if (!code) {
      throw new ConflictException({
        code: ApiErrorCode.AMENITY_CODE_TAKEN,
        message: 'Не удалось сгенерировать code из label_en',
      });
    }
    const clash = await this.prisma.amenity.findFirst({
      where: { code }, select: { id: true },
    });
    if (clash) {
      throw new ConflictException({
        code: ApiErrorCode.AMENITY_CODE_TAKEN,
        message: `Удобство с code «${code}» уже существует`,
      });
    }
    let row: AmenityRow;
    try {
      row = await this.prisma.amenity.create({
        data: {
          code,
          labelRu: dto.label_ru,
          labelUz: dto.label_uz,
          labelEn: dto.label_en,
          sortOrder: dto.sort_order ?? 0,
          isActive: dto.is_active ?? true,
        },
        select: SELECT,
      });
    } catch (error) {
      // Гонка: два параллельных create с одинаковым code проходят findFirst
      // одновременно — unique-индекс на code отдаёт P2002.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          code: ApiErrorCode.AMENITY_CODE_TAKEN,
          message: `Удобство с code «${code}» уже существует`,
        });
      }
      throw error;
    }
    return this.toResponse(row);
  }

  async update(id: string, dto: UpdateAmenityDto): Promise<AmenityResponse> {
    const existing = await this.prisma.amenity.findUnique({
      where: { id }, select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException({
        code: ApiErrorCode.NOT_FOUND, message: 'Удобство не найдено',
      });
    }
    const row = await this.prisma.amenity.update({
      where: { id },
      data: {
        ...(dto.label_ru !== undefined && { labelRu: dto.label_ru }),
        ...(dto.label_uz !== undefined && { labelUz: dto.label_uz }),
        ...(dto.label_en !== undefined && { labelEn: dto.label_en }),
        ...(dto.sort_order !== undefined && { sortOrder: dto.sort_order }),
        ...(dto.is_active !== undefined && { isActive: dto.is_active }),
      },
      select: SELECT,
    });
    return this.toResponse(row);
  }

  private async query(where: Prisma.AmenityWhereInput): Promise<AmenityResponse[]> {
    const rows = await this.prisma.amenity.findMany({
      where, select: SELECT, orderBy: ORDER,
    });
    return rows.map((r) => this.toResponse(r));
  }

  private toResponse(row: AmenityRow): AmenityResponse {
    return {
      id: row.id, code: row.code,
      label_ru: row.labelRu, label_uz: row.labelUz, label_en: row.labelEn,
      is_active: row.isActive, sort_order: row.sortOrder,
    };
  }
}
