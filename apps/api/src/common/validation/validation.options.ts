import { ValidationPipeOptions } from '@nestjs/common';

/**
 * Опции глобального ValidationPipe (TASK-022, CLAUDE.md §3 code style).
 *
 * - whitelist: вырезает свойства, не описанные в DTO.
 * - forbidNonWhitelisted: возвращает 400, если присланы лишние свойства.
 * - transform: преобразует payload к типам DTO (например, строку в number).
 * - enableImplicitConversion: автоконвертация примитивов из query/params.
 *
 * Вынесено в common/, чтобы переиспользовать в тестах и не дублировать
 * конфигурацию в main.ts.
 */
export const validationPipeOptions: ValidationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: {
    enableImplicitConversion: true,
  },
};
