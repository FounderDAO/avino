import { Controller, Get, Headers, Query } from '@nestjs/common';
import {
  NearMeSearchQueryDto,
  RadiusSearchQueryDto,
} from './dto/geo-search.dto';
import { SearchListingsQueryDto } from './dto/search-listings.dto';
import {
  CursorPaginatedResponse,
  SearchListItem,
  SearchService,
} from './search.service';

/**
 * SearchController — публичный поиск объявлений (TASK-080, API.md §9).
 *
 * Auth: public (гайды не подключаются). Версионирование URI обязательно
 * (CLAUDE.md §14); префикс `api` ставит main.ts → `GET /api/v1/search`. Язык
 * результатов выбирается по `?lang`/`Accept-Language` с фолбэком на оригинал.
 */
@Controller({ path: 'search', version: '1' })
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /** `GET /api/v1/search` — фильтрованный список ACTIVE-листингов (keyset). */
  @Get()
  search(
    @Query() query: SearchListingsQueryDto,
    @Query('lang') lang?: string,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<CursorPaginatedResponse<SearchListItem>> {
    return this.searchService.search(query, lang, acceptLanguage);
  }

  /**
   * `GET /api/v1/search/radius` — поиск ACTIVE-листингов в радиусе `radius_m`
   * метров от точки (`ST_DWithin`, GIST-индекс). Promotion-приоритетный порядок
   * (keyset), у каждого элемента — `distance_m`. API.md §10.
   */
  @Get('radius')
  searchRadius(
    @Query() query: RadiusSearchQueryDto,
    @Query('lang') lang?: string,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<CursorPaginatedResponse<SearchListItem>> {
    return this.searchService.searchRadius(query, lang, acceptLanguage);
  }

  /**
   * `GET /api/v1/search/near-me` — ближайшие к точке ACTIVE-листинги,
   * отсортированные по дистанции (`ST_Distance`); промо — вторичный ключ. Одна
   * страница размером `limit`. API.md §10.
   */
  @Get('near-me')
  searchNearMe(
    @Query() query: NearMeSearchQueryDto,
    @Query('lang') lang?: string,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<CursorPaginatedResponse<SearchListItem>> {
    return this.searchService.searchNearMe(query, lang, acceptLanguage);
  }
}
