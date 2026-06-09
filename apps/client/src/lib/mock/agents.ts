/**
 * Агенты/агентства Avino (выведены из авторов мок-листингов).
 * Используются в блоке «Агенты» на главной.
 */
import type { Agent } from './types';

export const AGENTS: Agent[] = [
  { id: 'ag-estate-group', name: 'Дилноза Каримова', pro: true, agency: 'Avino Pro · Estate Group', listingsCount: 14 },
  { id: 'ag-boulevard', name: 'Boulevard Development', pro: true, agency: 'Avino Pro · Застройщик', listingsCount: 8 },
  { id: 'ag-rent-service', name: 'Малика Юсупова', pro: true, agency: 'Avino Pro · Rent Service', listingsCount: 21 },
  { id: 'ag-nest-one', name: 'Nest One Sales', pro: true, agency: 'Avino Pro · Застройщик', listingsCount: 6 },
  { id: 'ag-city-homes', name: 'Жасур Тошпулатов', pro: true, agency: 'Avino Pro · City Homes', listingsCount: 11 },
  { id: 'ag-commercial-uz', name: 'Commercial UZ', pro: true, agency: 'Avino Pro', listingsCount: 9 },
];
