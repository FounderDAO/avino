import { ConfigService } from '@nestjs/config';
import { ListingUrlSyncQueue } from '../queues/listing-url-sync.queue';
import { ListingAutoTranslator } from './listing-auto-translator.service';
import { ListingTranslateWorker } from './listing-translate.worker';

function make(regenerated: string[]) {
  const translator = { generateTranslations: jest.fn().mockResolvedValue({ regenerated, skipped: [], detected_language: null }) };
  const urlSync = { enqueue: jest.fn().mockResolvedValue(undefined) };
  const worker = new ListingTranslateWorker(
    { get: () => undefined } as unknown as ConfigService,
    translator as unknown as ListingAutoTranslator,
    urlSync as unknown as ListingUrlSyncQueue,
  );
  return { worker, translator, urlSync };
}

describe('ListingTranslateWorker (SEO AUD-14)', () => {
  it('translates the approved listing and syncs the page when something changed', async () => {
    const { worker, translator, urlSync } = make(['UZ', 'EN']);
    await worker.process('l1');
    expect(translator.generateTranslations).toHaveBeenCalledWith('l1');
    expect(urlSync.enqueue).toHaveBeenCalledWith(['l1']);
  });

  it('does not sync when nothing was (re)generated', async () => {
    const { worker, urlSync } = make([]);
    await worker.process('l1');
    expect(urlSync.enqueue).not.toHaveBeenCalled();
  });

  it('does not start a BullMQ worker while TRANSLATE_ON_APPROVE is off', () => {
    const { worker } = make([]);
    expect(() => worker.onModuleInit()).not.toThrow();
  });
});
