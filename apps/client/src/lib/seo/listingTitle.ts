/**
 * SEO-хелпер: заголовок объявления из структурированных полей.
 *
 * Заголовок из API — свободный текст автора, и чаще всего это просто адрес
 * («г. Ташкент, Мирзо-Улугбекский район»): у десятков объявлений одного района
 * он совпадает и не переводится. Поэтому H1, <title>, JSON-LD и og:title строятся
 * из полей: сделка, тип, комнаты, площадь, участок, район — на языке страницы.
 *
 * Пример (ru): «Продаётся 3-комн. квартира, 78 м² — Юнусабадский район».
 * Отсутствующие поля просто пропускаются: без «undefined» и двойных разделителей.
 */
import type { Listing } from '@/lib/mock/types';
import { normalizeArea, type T } from '@/lib/format';

export type HeadlineListing = Pick<Listing, 'tx' | 'type' | 'rooms' | 'area' | 'lotArea' | 'district'>;

function capitalize(text: string): string {
  return text ? text.charAt(0).toLocaleUpperCase() + text.slice(1) : text;
}

/**
 * @param t      переводчик неймспейса `listing` (ключи `headline.*`)
 * @param tUnits переводчик неймспейса `units` (`area`, `lotArea`)
 */
export function listingHeadline(listing: HeadlineListing, t: T, tUnits: T): string {
  const typeWord = t(`headline.type.${listing.type}`);
  const hasRooms = Boolean(listing.rooms) && (listing.type === 'APARTMENT' || listing.type === 'HOUSE');
  const object = hasRooms ? t('headline.withRooms', { rooms: listing.rooms!, object: typeWord }) : typeWord;
  const lead = capitalize(t(`headline.${listing.tx}`, { object }));

  const details: string[] = [];
  const area = normalizeArea(listing.area);
  const lot = normalizeArea(listing.lotArea);
  if (listing.type === 'LAND') {
    if (lot) details.push(tUnits('lotArea', { value: lot }));
    else if (area) details.push(tUnits('area', { value: area }));
  } else {
    if (area) details.push(tUnits('area', { value: area }));
    if (listing.type === 'HOUSE' && lot) details.push(tUnits('lotArea', { value: lot }));
  }

  const body = [lead, ...details].join(', ');
  const district = listing.district?.trim();
  return district ? t('headline.withDistrict', { headline: body, district }) : body;
}

/** Описание для объявления без текста автора: «{headline}. Цена: {price}.» */
export function listingSummary(listing: HeadlineListing, price: string, t: T, tUnits: T): string {
  return t('headline.summary', { headline: listingHeadline(listing, t, tUnits), price });
}
