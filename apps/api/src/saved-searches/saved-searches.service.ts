import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { AuthenticatedUser } from '../common/guards';
import { PrismaService } from '../prisma';
import { CreateSavedSearchDto } from './dto/create-saved-search.dto';
import { UpdateSavedSearchDto } from './dto/update-saved-search.dto';

/** Дефолт/максимум размера страницы (API.md §4: default 20, max 100). */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Поддерживаемые версии схемы `filters_json`. Сейчас только `1`; матчер обязан
 * оставаться толерантным к ранее сохранённым версиям (API.md §12), но НА ЗАПИСЬ
 * мы принимаем лишь известные версии — неизвестная даёт `422`. Расширяется по мере
 * эволюции набора фильтров поиска (TASK-081/082).
 */
const SUPPORTED_SCHEMA_VERSIONS: ReadonlySet<number> = new Set([1]);

/** Поля выборки сохранённого поиска под {@link SavedSearchResponse}. */
const SELECT = {
  id: true,
  name: true,
  isActive: true,
  filtersJson: true,
  lastCheckedAt: true,
  createdAt: true,
} satisfies Prisma.SavedSearchSelect;

type SavedSearchRow = Prisma.SavedSearchGetPayload<{ select: typeof SELECT }>;

/** Версионированный контейнер фильтров (API.md §12). */
export interface SavedSearchFiltersJson {
  schemaVersion: number;
  filters: Record<string, unknown>;
}

/** Объект сохранённого поиска в ответах API (API.md §12, snake_case контракт). */
export interface SavedSearchResponse {
  id: string;
  name: string;
  is_active: boolean;
  filters_json: SavedSearchFiltersJson;
  last_checked_at: string | null;
  created_at: string;
}

/** Ответ `GET /api/v1/saved-searches`: страница + `{ limit, total }` (API.md §12). */
export interface SavedSearchListResponse {
  data: SavedSearchResponse[];
  meta: { limit: number; total: number };
}

/**
 * SavedSearchesService — CRUD сохранённых поисков пользователя (TASK-091, API.md §12).
 *
 * Только авторизованные (`GUEST` отсекает {@link JwtAuthGuard} на контроллере).
 * Владение enforced на уровне запросов: write/delete идут через
 * `(id, user_id)`-фильтр (`updateMany`/`deleteMany`), поэтому чужой поиск
 * недоступен и не «течёт» существованием — несовпадение → `404`.
 *
 * `filters_json` версионирован (`{ schemaVersion, filters }`): на запись
 * принимается только поддерживаемая `schemaVersion`, иначе `422
 * UNSUPPORTED_FILTER_SCHEMA`. Содержимое `filters` не валидируется по DTO
 * `/search` — матчер (TASK-1xx, polling) толерантен к версиям, а параметры поиска
 * эволюционируют.
 */
@Injectable()
export class SavedSearchesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `GET /api/v1/saved-searches` — список поисков пользователя, свежие сверху
   * (`created_at DESC, id DESC`). Без keyset-курсора: контракт §12 отдаёт лишь
   * `{ limit, total }`.
   */
  async list(
    user: AuthenticatedUser,
    limitParam: number | undefined,
  ): Promise<SavedSearchListResponse> {
    const limit = Math.min(limitParam ?? DEFAULT_LIMIT, MAX_LIMIT);
    const where: Prisma.SavedSearchWhereInput = { userId: user.id };

    const [rows, total] = await Promise.all([
      this.prisma.savedSearch.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
        select: SELECT,
      }),
      this.prisma.savedSearch.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.toResponse(row)),
      meta: { limit, total },
    };
  }

  /**
   * `POST /api/v1/saved-searches` — создать поиск. `schemaVersion` должна быть
   * поддерживаемой, иначе `422 UNSUPPORTED_FILTER_SCHEMA`. → `201`.
   */
  async create(
    user: AuthenticatedUser,
    dto: CreateSavedSearchDto,
  ): Promise<SavedSearchResponse> {
    this.assertSupportedSchema(dto.filters_json.schemaVersion);

    const created = await this.prisma.savedSearch.create({
      data: {
        userId: user.id,
        name: dto.name,
        filtersJson: this.toJsonInput(dto.filters_json),
      },
      select: SELECT,
    });
    return this.toResponse(created);
  }

  /**
   * `PATCH /api/v1/saved-searches/:id` — частичное обновление `name` /
   * `filters_json` / `is_active`. Только владелец (`(id, user_id)`-фильтр):
   * чужой/несуществующий поиск → `404`. Неизвестная `schemaVersion` → `422`.
   */
  async update(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateSavedSearchDto,
  ): Promise<SavedSearchResponse> {
    if (dto.filters_json !== undefined) {
      this.assertSupportedSchema(dto.filters_json.schemaVersion);
    }

    const data: Prisma.SavedSearchUpdateInput = {};
    if (dto.name !== undefined) {
      data.name = dto.name;
    }
    if (dto.is_active !== undefined) {
      data.isActive = dto.is_active;
    }
    if (dto.filters_json !== undefined) {
      data.filtersJson = this.toJsonInput(dto.filters_json);
    }

    // Гард владения атомарен на уровне записи: обновляем только свою строку.
    const { count } = await this.prisma.savedSearch.updateMany({
      where: { id, userId: user.id },
      data,
    });
    if (count === 0) {
      throw this.notFound();
    }

    const updated = await this.prisma.savedSearch.findUnique({
      where: { id },
      select: SELECT,
    });
    if (!updated) {
      // Удалён конкурентно между update и чтением.
      throw this.notFound();
    }
    return this.toResponse(updated);
  }

  /**
   * `DELETE /api/v1/saved-searches/:id` — удалить свой поиск. Удаление по
   * `(id, user_id)`: чужой/несуществующий → `404`. → `204`.
   */
  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    const { count } = await this.prisma.savedSearch.deleteMany({
      where: { id, userId: user.id },
    });
    if (count === 0) {
      throw this.notFound();
    }
  }

  /** `422 UNSUPPORTED_FILTER_SCHEMA` для неизвестной версии схемы фильтров. */
  private assertSupportedSchema(schemaVersion: number): void {
    if (!SUPPORTED_SCHEMA_VERSIONS.has(schemaVersion)) {
      throw new UnprocessableEntityException({
        code: ApiErrorCode.UNSUPPORTED_FILTER_SCHEMA,
        message: `Unsupported filters schemaVersion: ${schemaVersion}`,
      });
    }
  }

  /** Нормализует контейнер фильтров к JSON-входу Prisma (`{ schemaVersion, filters }`). */
  private toJsonInput(filtersJson: SavedSearchFiltersJson): Prisma.InputJsonValue {
    return {
      schemaVersion: filtersJson.schemaVersion,
      filters: filtersJson.filters,
    } as Prisma.InputJsonValue;
  }

  private toResponse(row: SavedSearchRow): SavedSearchResponse {
    return {
      id: row.id,
      name: row.name,
      is_active: row.isActive,
      filters_json: row.filtersJson as unknown as SavedSearchFiltersJson,
      last_checked_at: row.lastCheckedAt
        ? row.lastCheckedAt.toISOString()
        : null,
      created_at: row.createdAt.toISOString(),
    };
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: ApiErrorCode.NOT_FOUND,
      message: 'Saved search not found',
    });
  }
}
