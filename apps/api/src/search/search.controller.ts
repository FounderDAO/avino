import { Controller, Get, Headers, Query } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import {
  BoundsSearchQueryDto,
  NearMeSearchQueryDto,
  PolygonSearchQueryDto,
  RadiusSearchQueryDto,
} from './dto/geo-search.dto';
import { SearchListingsQueryDto } from './dto/search-listings.dto';
import {
  PriceDistributionQueryDto,
  PriceDistributionResponseDto,
} from './dto/price-distribution.dto';
import {
  ClustersResponseDto,
  ClustersSearchQueryDto,
} from './dto/clusters.dto';
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
   * `GET /api/v1/search/bounds` — ACTIVE-листинги внутри видимой области карты
   * (`ST_MakeEnvelope`/`ST_Within` по `sw_*`/`ne_*` углам). Promotion-приоритетный
   * порядок (keyset), как у `/search`; `distance_m` нет. Маркеры для карты. API.md §10.
   */
  @Get('bounds')
  searchBounds(
    @Query() query: BoundsSearchQueryDto,
    @Query('lang') lang?: string,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<CursorPaginatedResponse<SearchListItem>> {
    return this.searchService.searchBounds(query, lang, acceptLanguage);
  }

  /**
   * `GET /api/v1/search/clusters` — агрегаты кластерной сетки для широких зумов
   * карты (TASK-225, ADR-0126): ячейки с count/min_price/avg_price вместо
   * страницы листингов. bbox + zoom + все фильтры §9. Auth: public.
   */
  @Get('clusters')
  @ApiOkResponse({ type: ClustersResponseDto })
  searchClusters(
    @Query() query: ClustersSearchQueryDto,
  ): Promise<ClustersResponseDto> {
    return this.searchService.searchClusters(query);
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

  /**
   * `GET /api/v1/search/price-distribution` — гистограмма распределения цены
   * для слайдера фильтра (Zillow-вид). Глобально по (currency, transaction_type),
   * только видимые ACTIVE-объявления. Auth: public.
   */
  @Get('price-distribution')
  @ApiOkResponse({ type: PriceDistributionResponseDto })
  priceDistribution(
    @Query() query: PriceDistributionQueryDto,
  ): Promise<PriceDistributionResponseDto> {
    return this.searchService.priceDistribution(query);
  }

  /**
   * `GET /api/v1/search/polygon` — ACTIVE-листинги внутри произвольного полигона
   * (`ST_MakePolygon`/`ST_Within`). Полигон задаётся параметром `points` в виде
   * строки `lat,lng` пар через `;`. Promotion-приоритетный порядок (keyset), как у
   * `/search/bounds`; `distance_m` нет. Используется для draw-territory (ласо
   * на карте, TASK-152/TASK-193). Auth: **public**. API.md §10.
   */
  @Get('polygon')
  searchPolygon(
    @Query() query: PolygonSearchQueryDto,
    @Query('lang') lang?: string,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<CursorPaginatedResponse<SearchListItem>> {
    return this.searchService.searchPolygon(query, lang, acceptLanguage);
  }
}
