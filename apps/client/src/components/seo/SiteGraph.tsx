/**
 * SiteGraph — единственный JSON-LD страницы: @graph с организацией, сайтом и
 * узлами страницы (lib/seo/graph). Раньше layout выводил Organization и WebSite
 * отдельными скриптами без @id-связей.
 *
 * `page` добавляет WebPage и крошки: по умолчанию «Главная › <страница>»,
 * свой путь — через `crumbs`, ссылка на уже построенные крошки — `breadcrumbId`.
 */
import { getLocale, getTranslations } from 'next-intl/server';
import { JsonLd } from './JsonLd';
import { localeUrl } from '@/lib/seo/alternates';
import {
  breadcrumbNode,
  pageGraph,
  webPageNode,
  type Crumb,
  type Node,
  type WebPageType,
} from '@/lib/seo/graph';

export interface SiteGraphPage {
  /** Путь без локали: `/`, `/help`, `/agents/<id>`. */
  path: string;
  /** Название страницы или ключ сообщения (`help.meta.title`). */
  name?: string;
  nameKey?: string;
  type?: WebPageType;
  /** Свои крошки (последняя — текущая страница). */
  crumbs?: Crumb[];
  /** @id крошек, уже добавленных в `nodes`. */
  breadcrumbId?: string;
  mainEntityId?: string;
  aboutOrg?: boolean;
}

export async function SiteGraph({ nodes = [], page }: { nodes?: Node[]; page?: SiteGraphPage }) {
  const locale = await getLocale();
  const extra: Node[] = [];
  if (page) {
    const t = await getTranslations({ locale });
    const url = localeUrl(locale, page.path);
    const name = page.name ?? (page.nameKey ? t(page.nameKey as never) : '');
    let breadcrumbId = page.breadcrumbId;
    if (!breadcrumbId && page.path !== '/') {
      const crumbs = page.crumbs ?? [
        { name: t('breadcrumb.home' as never), url: localeUrl(locale, '/') },
        { name, url },
      ];
      const crumb = breadcrumbNode(url, crumbs);
      breadcrumbId = crumb['@id'] as string;
      extra.push(crumb);
    }
    extra.unshift(
      webPageNode({ url, name, locale, type: page.type, breadcrumbId, mainEntityId: page.mainEntityId, aboutOrg: page.aboutOrg }),
    );
  }
  return <JsonLd data={pageGraph(locale, [...extra, ...nodes])} />;
}
