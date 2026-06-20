import { HttpException } from '@nestjs/common';
import { validateToursInput, windowOffered, TourWindow } from './tour-window';

const W = (start: string, end: string): TourWindow => ({ start, end });

describe('validateToursInput', () => {
  it('пропускает валидные окна', () => {
    expect(() => validateToursInput(true, [W('07:00', '10:00'), W('18:00', '20:00')])).not.toThrow();
  });
  it('кидает 422 если start >= end', () => {
    expect(() => validateToursInput(true, [W('10:00', '07:00')])).toThrow(HttpException);
  });
  it('кидает 422 на неверный формат', () => {
    expect(() => validateToursInput(true, [W('7:0', '10:00')])).toThrow(HttpException);
  });
  it('кидает 422 если tours_enabled без окон', () => {
    expect(() => validateToursInput(true, [])).toThrow(HttpException);
  });
  it('разрешает tours_enabled=false без окон', () => {
    expect(() => validateToursInput(false, [])).not.toThrow();
  });
});

describe('windowOffered', () => {
  const windows = [W('07:00', '10:00'), W('18:00', '20:00')];
  it('true для предложенного окна', () => {
    expect(windowOffered(windows, '18:00', '20:00')).toBe(true);
  });
  it('false для непредложенного окна', () => {
    expect(windowOffered(windows, '12:00', '15:00')).toBe(false);
  });
});
