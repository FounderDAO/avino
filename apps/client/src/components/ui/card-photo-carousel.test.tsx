import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, createEvent } from '@testing-library/react';
import { CardPhotoCarousel } from './card-photo-carousel';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key,
}));
vi.mock('./photo-img', () => ({
  PhotoImg: ({ src }: { src: string }) => <div data-testid="cur" data-src={src} />,
}));

const photos = [
  { url: 'a', thumb: 'a-thumb' },
  { url: 'b', thumb: 'b-thumb' },
  { url: 'c', thumb: 'c-thumb' },
];

const curSrc = () => screen.getByTestId('cur').getAttribute('data-src');

describe('CardPhotoCarousel', () => {
  it('листает next/prev с заворотом по кругу', () => {
    render(<CardPhotoCarousel photos={photos} alt="x" />);
    expect(curSrc()).toBe('a-thumb');

    fireEvent.click(screen.getByLabelText('photoNext'));
    expect(curSrc()).toBe('b-thumb');

    fireEvent.click(screen.getByLabelText('photoNext'));
    fireEvent.click(screen.getByLabelText('photoNext')); // с последнего → первое
    expect(curSrc()).toBe('a-thumb');

    fireEvent.click(screen.getByLabelText('photoPrev')); // с первого назад → последнее
    expect(curSrc()).toBe('c-thumb');
  });

  it('клик по точке открывает соответствующее фото', () => {
    render(<CardPhotoCarousel photos={photos} alt="x" />);
    fireEvent.click(screen.getByLabelText('goToPhoto:{"n":3}'));
    expect(curSrc()).toBe('c-thumb');
  });

  it('при одном фото нет стрелок и точек', () => {
    render(<CardPhotoCarousel photos={[photos[0]]} alt="x" />);
    expect(screen.queryByLabelText('photoNext')).toBeNull();
    expect(screen.queryByLabelText('goToPhoto:{"n":1}')).toBeNull();
  });

  it('клик по стрелке гасит навигацию (preventDefault + stopPropagation)', () => {
    render(<CardPhotoCarousel photos={photos} alt="x" />);
    const btn = screen.getByLabelText('photoNext');
    const ev = createEvent.click(btn);
    const stop = vi.spyOn(ev, 'stopPropagation');
    fireEvent(btn, ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(stop).toHaveBeenCalled();
  });
});
