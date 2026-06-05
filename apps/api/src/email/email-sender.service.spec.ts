import { ConfigService } from '@nestjs/config';

const sendMailMock = jest.fn();
const createTransportMock = jest.fn((_options: unknown) => ({
  sendMail: sendMailMock,
}));

jest.mock('nodemailer', () => ({
  createTransport: (options: unknown) => createTransportMock(options),
}));

import { EmailSender } from './email-sender.service';

/**
 * Юнит-тесты транспорта email (TASK-101). nodemailer мокается. Проверяют три
 * ветки доставки и логирование результата (acceptance: «email delivery result
 * is logged» — здесь как возвращаемый статус): dev без SMTP, production без
 * SMTP, настроенный SMTP (реальный sendMail) и проброс ошибки транспорта.
 */
describe('EmailSender', () => {
  const config = (values: Record<string, unknown>): ConfigService =>
    ({ get: (key: string) => values[key] }) as unknown as ConfigService;

  const payload = { to: 'user@example.com', subject: 'Hi', text: 'Body' };

  beforeEach(() => {
    sendMailMock.mockReset();
    createTransportMock.mockClear();
  });

  it('skips delivery and logs in dev when SMTP is not configured', async () => {
    const sender = new EmailSender(config({ 'app.env': 'development' }));
    const result = await sender.deliver(payload);

    expect(result.status).toBe('SKIPPED_DEV');
    expect(createTransportMock).not.toHaveBeenCalled();
  });

  it('skips delivery in production when SMTP is not configured', async () => {
    const sender = new EmailSender(config({ 'app.env': 'production' }));
    const result = await sender.deliver(payload);

    expect(result.status).toBe('SKIPPED_NOT_CONFIGURED');
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('sends via SMTP and returns SENT with messageId when configured', async () => {
    sendMailMock.mockResolvedValue({ messageId: 'abc-123' });
    const sender = new EmailSender(
      config({
        'app.env': 'production',
        'mail.host': 'smtp.example.com',
        'mail.port': 587,
        'mail.user': 'u',
        'mail.password': 'p',
        'mail.from': 'no-reply@avino.uz',
      }),
    );

    const result = await sender.deliver(payload);

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: { user: 'u', pass: 'p' },
      }),
    );
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'no-reply@avino.uz',
        to: 'user@example.com',
        subject: 'Hi',
        text: 'Body',
      }),
    );
    expect(result).toMatchObject({ status: 'SENT', messageId: 'abc-123' });
  });

  it('uses implicit TLS (secure) on port 465', async () => {
    sendMailMock.mockResolvedValue({ messageId: 'x' });
    const sender = new EmailSender(
      config({ 'app.env': 'production', 'mail.host': 'smtp.x', 'mail.port': 465 }),
    );
    await sender.deliver(payload);
    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({ secure: true, auth: undefined }),
    );
  });

  it('propagates transport failures so BullMQ can retry', async () => {
    sendMailMock.mockRejectedValue(new Error('SMTP down'));
    const sender = new EmailSender(
      config({ 'app.env': 'production', 'mail.host': 'smtp.x', 'mail.port': 587 }),
    );
    await expect(sender.deliver(payload)).rejects.toThrow('SMTP down');
  });
});
