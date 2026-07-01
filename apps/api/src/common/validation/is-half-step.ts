import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Значение кратно 0.5 (санузлы: 1, 1.5, 2, …; баглист мобилки #3, вариант A).
 * Некратные дроби (1.3) → 400, чтобы в БД не попадали «случайные» десятые.
 */
export function IsHalfStep(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isHalfStep',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a multiple of 0.5`,
        ...validationOptions,
      },
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'number' && Number.isInteger(value * 2);
        },
      },
    });
  };
}
