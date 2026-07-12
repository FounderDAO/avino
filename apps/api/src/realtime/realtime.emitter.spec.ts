import { RealtimeEmitter } from './realtime.emitter';
import { REALTIME_EVENT, userRoom } from './realtime.types';

describe('RealtimeEmitter', () => {
  it('no-op пока server не установлен (не бросает)', () => {
    const emitter = new RealtimeEmitter();
    expect(() => emitter.emit('u1', { type: 'notification' })).not.toThrow();
  });

  it('шлёт событие в комнату пользователя', () => {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    const emitter = new RealtimeEmitter();
    emitter.setServer({ to } as never);

    emitter.emit('u1', { type: 'thread', id: 't42' });

    expect(to).toHaveBeenCalledWith(userRoom('u1'));
    expect(emit).toHaveBeenCalledWith(REALTIME_EVENT, { type: 'thread', id: 't42' });
  });
});
