import { ConfigService } from '@nestjs/config';
import { UnrecoverableError } from 'bullmq';
import { SeoSyncProcessor } from './seo-sync.processor';

const ID = '3c2e8ab9-7480-4ebd-aef4-4be20d8d0019';

function make(status: number, url = 'https://avino.uz/api/seo/sync') {
  const config = { get: (k: string) => ({ 'seoSync.url': url, 'seoSync.secret': 's3cret' })[k] } as unknown as ConfigService;
  const fetchImpl = jest.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status });
  return { processor: new SeoSyncProcessor(config, fetchImpl as unknown as typeof fetch), fetchImpl };
}

describe('SeoSyncProcessor (SEO AUD-11)', () => {
  it('posts the listing id with the bearer secret', async () => {
    const { processor, fetchImpl } = make(200);
    await processor.process(ID);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://avino.uz/api/seo/sync');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer s3cret');
    expect(JSON.parse(init.body)).toEqual({ listing_ids: [ID] });
  });

  it('throws a retryable error on 5xx', async () => {
    const { processor } = make(503);
    await expect(processor.process(ID)).rejects.toThrow('SEO sync failed: 503');
    await expect(processor.process(ID)).rejects.not.toBeInstanceOf(UnrecoverableError);
  });

  it('does not retry a 4xx (wrong secret or body)', async () => {
    const { processor } = make(401);
    await expect(processor.process(ID)).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it('does nothing when the site URL is not configured', async () => {
    const { processor, fetchImpl } = make(200, '');
    await processor.process(ID);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
