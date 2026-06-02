import {
  BadRequestException,
  ValidationError,
  ValidationPipeOptions,
} from '@nestjs/common';
import { ApiErrorCode, ApiErrorDetail } from '../dto/error-response.dto';

/**
 * Разворачивает дерево `ValidationError` class-validator в плоский список
 * пер-полевых деталей (`{ field, issue }`) для error-envelope (docs/API.md §4).
 * Вложенные DTO получают путь через точку: `address.city`.
 */
function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): ApiErrorDetail[] {
  const details: ApiErrorDetail[] = [];
  for (const error of errors) {
    const field = parentPath ? `${parentPath}.${error.property}` : error.property;
    if (error.constraints) {
      for (const issue of Object.values(error.constraints)) {
        details.push({ field, issue });
      }
    }
    if (error.children && error.children.length > 0) {
      details.push(...flattenValidationErrors(error.children, field));
    }
  }
  return details;
}

/**
 * Опции глобального ValidationPipe (TASK-022/TASK-023, CLAUDE.md §3 code style).
 *
 * - whitelist: вырезает свойства, не описанные в DTO.
 * - forbidNonWhitelisted: возвращает 400, если присланы лишние свойства.
 * - transform: преобразует payload к типам DTO (например, строку в number).
 * - enableImplicitConversion: автоконвертация примитивов из query/params.
 * - exceptionFactory: формирует структурированный `VALIDATION_ERROR` с `details`,
 *   которые `AllExceptionsFilter` отдаёт в едином error-envelope (TASK-023).
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
  exceptionFactory: (errors: ValidationError[]) =>
    new BadRequestException({
      code: ApiErrorCode.VALIDATION_ERROR,
      message: 'Invalid request body',
      details: flattenValidationErrors(errors),
    }),
};
