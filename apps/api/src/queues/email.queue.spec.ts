import { ConfigService } from '@nestjs/config';

const addMock = jest.fn();
const closeMock = jest.fn();

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: addMock,
    close: closeMock,
  })),
}));

import { Queue } from 'bullmq';
import { EmailQueue } from './email.queue';
import { EMAIL_QUEUE_NAME, SEND_EMAIL_JOB } from './queue.constants';

/**
 * Юнит-тесты продюсера очереди email (TASK-101). BullMQ `Queue` мокается.
 * Проверяют: имя очереди, имя/нагрузку джобы `send_email`, опции ретрая
 * (acceptance: доставка может повторяться) и чтение `attempts` из конфигурации.
 */
describe('EmailQueue', () => {
  const config = (attempts?: number): ConfigService =>
    ({
      get: (key: string) =>
        key === 'redis.url'
          ? 'redis://localhost:6379'
          : key === 'mail.queueAttempts'
            ? attempts
            : undefined,
    }) as unknown as ConfigService;

  beforeEach(() => {
    addMock.mockReset();
    closeMock.mockReset();
    (Queue as unknown as jest.Mock).mockClear();
  });

  it('creates the email_queue with the resolved connection', () => {
    new EmailQueue(config(3));
    expect(Queue).toHaveBeenCalledWith(
      EMAIL_QUEUE_NAME,
      expect.objectContaining({ connection: expect.any(Object) }),
    );
  });

  it('enqueues a send_email job with the payload and retry options', async () => {
    const queue = new EmailQueue(config(5));

    await queue.enqueueSendEmail({
      to: 'user@example.com',
      subject: 'Hi',
      text: 'Body',
    });

    expect(addMock).toHaveBeenCalledWith(
      SEND_EMAIL_JOB,
      { to: 'user@example.com', subject: 'Hi', text: 'Body' },
      expect.objectContaining({
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
      }),
    );
  });

  it('does not set a dedup jobId (repeat emails are distinct jobs)', async () => {
    const queue = new EmailQueue(config(3));
    await queue.enqueueSendEmail({ to: 'a@b.c', subject: 's', text: 't' });
    expect(addMock.mock.calls[0][2]).not.toHaveProperty('jobId');
  });

  it('defaults to 3 attempts when not configured', async () => {
    const queue = new EmailQueue(config(undefined));
    await queue.enqueueSendEmail({ to: 'a@b.c', subject: 's', text: 't' });
    expect(addMock.mock.calls[0][2]).toMatchObject({ attempts: 3 });
  });
});
