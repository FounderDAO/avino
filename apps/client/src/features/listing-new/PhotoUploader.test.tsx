import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ru from '../../../messages/ru.json';

vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => (k: string) =>
    (ru as any)[ns]?.photoUploader?.[k.replace('photoUploader.', '')] ??
    (ru as any)[ns]?.[k] ??
    k,
}));

import { PhotoUploader } from './PhotoUploader';

describe('PhotoUploader', () => {
  it('в пустом состоянии НЕ показывает кнопку демо-фото', () => {
    render(<PhotoUploader photos={[]} setPhotos={vi.fn()} />);
    // dropzone присутствует
    expect(screen.getByText(ru.listingNew.photoUploader.dropTitle)).toBeInTheDocument();
    // демо-кнопки больше нет
    expect(screen.queryByText('Добавить демо-фото')).toBeNull();
  });
});
