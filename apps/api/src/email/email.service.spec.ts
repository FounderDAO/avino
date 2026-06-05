import { EmailQueue } from '../queues/email.queue';
import { EmailService } from './email.service';

/**
 * Юнит-тесты фасада EmailService (TASK-101). EmailQueue мокается — проверяем,
 * что письма ставятся в очередь (acceptance: «email job can be queued»), а не
 * отправляются синхронно, и что sendOtp формирует корректные subject/text.
 */
describe('EmailService', () => {
  const enqueue = jest.fn();
  const queue = { enqueueSendEmail: enqueue } as unknown as EmailQueue;
  let service: EmailService;

  beforeEach(() => {
    enqueue.mockReset();
    service = new EmailService(queue);
  });

  it('enqueues an OTP email with the code in the body', async () => {
    await service.sendOtp('user@example.com', '123456');

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: expect.stringContaining('Avino'),
        text: expect.stringContaining('123456'),
      }),
    );
  });

  it('passes an arbitrary email straight through to the queue', async () => {
    const data = { to: 'a@b.c', subject: 'Subj', text: 'Body' };
    await service.sendEmail(data);
    expect(enqueue).toHaveBeenCalledWith(data);
  });
});
