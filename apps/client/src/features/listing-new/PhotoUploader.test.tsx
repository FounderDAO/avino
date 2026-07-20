import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import ru from '../../../messages/ru.json';

// Мок повторяет ICU-подстановку {count}/{max}: без неё тест не заметил бы
// отсутствующий ключ или неверный плейсхолдер (см. avino-client-test-i18n-gotchas).
vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => (k: string, values?: Record<string, unknown>) => {
    const raw =
      (ru as any)[ns]?.photoUploader?.[k.replace('photoUploader.', '')] ??
      (ru as any)[ns]?.[k] ??
      k;
    return typeof raw === 'string' && values
      ? raw.replace(/\{(\w+)\}/g, (_m, key) => String(values[key] ?? `{${key}}`))
      : raw;
  },
}));

import { PhotoUploader } from './PhotoUploader';

const t = ru.listingNew.photoUploader;

/** Файл нужного типа/размера без чтения с диска. */
function makeFile(name: string, type: string, sizeBytes: number): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

/** Найти скрытый <input type="file"> и подсунуть ему набор файлов. */
function selectFiles(container: HTMLElement, files: File[]) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files } });
  return input;
}

beforeAll(() => {
  // jsdom не реализует createObjectURL.
  Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:stub', writable: true });
});

describe('PhotoUploader', () => {
  it('в пустом состоянии НЕ показывает кнопку демо-фото', () => {
    render(<PhotoUploader photos={[]} setPhotos={vi.fn()} />);
    expect(screen.getByText(t.dropTitle)).toBeInTheDocument();
    expect(screen.queryByText('Добавить демо-фото')).toBeNull();
  });

  it('принимает JPG/PNG/WebP и не жалуется', () => {
    const setPhotos = vi.fn();
    const { container } = render(<PhotoUploader photos={[]} setPhotos={setPhotos} />);

    selectFiles(container, [
      makeFile('a.jpg', 'image/jpeg', 1024),
      makeFile('b.png', 'image/png', 1024),
      makeFile('c.webp', 'image/webp', 1024),
    ]);

    expect(setPhotos).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('отклоняет HEIC и объясняет причину, не отправляя его в setPhotos', () => {
    const setPhotos = vi.fn();
    const { container } = render(<PhotoUploader photos={[]} setPhotos={setPhotos} />);

    selectFiles(container, [
      makeFile('IMG_1.heic', 'image/heic', 1024),
      makeFile('IMG_2.heic', 'image/heic', 1024),
    ]);

    expect(setPhotos).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Пропущено файлов: 2');
  });

  it('отклоняет файл больше 10 МБ', () => {
    const setPhotos = vi.fn();
    const { container } = render(<PhotoUploader photos={[]} setPhotos={setPhotos} />);

    selectFiles(container, [makeFile('big.jpg', 'image/jpeg', 10 * 1024 * 1024 + 1)]);

    expect(setPhotos).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('не должен превышать 10 МБ');
  });

  it('обрезает набор до лимита в 20 фото и сообщает о пропущенных', () => {
    const setPhotos = vi.fn();
    // Уже есть 18 фото — влезет ещё 2 из 5.
    const existing = Array.from({ length: 18 }, (_, i) => ({ id: `p${i}`, url: 'blob:stub' }));
    const { container } = render(<PhotoUploader photos={existing} setPhotos={setPhotos} />);

    selectFiles(
      container,
      Array.from({ length: 5 }, (_, i) => makeFile(`p${i}.jpg`, 'image/jpeg', 1024)),
    );

    const added = setPhotos.mock.calls[0][0](existing);
    expect(added).toHaveLength(20);
    expect(screen.getByRole('alert')).toHaveTextContent('Пропущено файлов: 3');
  });

  it('сбрасывает value инпута, чтобы повторный выбор того же файла сработал', () => {
    const { container } = render(<PhotoUploader photos={[]} setPhotos={vi.fn()} />);
    const input = selectFiles(container, [makeFile('a.jpg', 'image/jpeg', 1024)]);
    expect(input.value).toBe('');
  });
});
