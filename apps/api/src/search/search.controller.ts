import { Controller, Get, Headers, Query } from '@nestjs/common';
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
}
