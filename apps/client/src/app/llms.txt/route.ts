/**
 * /llms.txt — справка об Avino для AI-ассистентов (llmstxt.org): кто мы,
 * разделы и районы с каноническими URL на ru/uz/en. Кэш — час.
 */
import { renderLlmsTxt } from '@/lib/seo/llmsData';

export const revalidate = 3600;

export async function GET(): Promise<Response> {
  return new Response(await renderLlmsTxt(false), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
