import { RealtimeGateway } from './realtime.gateway';
import { userRoom } from './realtime.types';

function makeGateway(verifyResult: { userId: string } | null) {
  const authenticator = { verify: jest.fn().mockResolvedValue(verifyResult) };
  const emitter = { setServer: jest.fn() };
  const gateway = new RealtimeGateway(authenticator as never, emitter as never);
  return { gateway, authenticator, emitter };
}

function fakeSocket(token: string | undefined) {
  return { handshake: { auth: { token } }, join: jest.fn(), disconnect: jest.fn() };
}

describe('RealtimeGateway', () => {
  it('afterInit прокидывает server в эмиттер', () => {
    const { gateway, emitter } = makeGateway({ userId: 'u1' });
    const server = { to: jest.fn() };
    gateway.afterInit(server as never);
    expect(emitter.setServer).toHaveBeenCalledWith(server);
  });

  it('валидный токен → join в комнату пользователя', async () => {
    const { gateway } = makeGateway({ userId: 'u1' });
    const socket = fakeSocket('good');
    await gateway.handleConnection(socket as never);
    expect(socket.join).toHaveBeenCalledWith(userRoom('u1'));
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('невалидный токен → disconnect, без join', async () => {
    const { gateway } = makeGateway(null);
    const socket = fakeSocket(undefined);
    await gateway.handleConnection(socket as never);
    expect(socket.disconnect).toHaveBeenCalled();
    expect(socket.join).not.toHaveBeenCalled();
  });
});
