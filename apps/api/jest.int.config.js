/**
 * Jest-конфиг integration-тестов @avino/api (`*.int-spec.ts`).
 *
 * Отдельно от unit-конфига (`jest.config.js`, `*.spec.ts`): эти тесты ходят в
 * живой PostgreSQL (`DATABASE_URL`), поэтому не входят в дефолтный `pnpm test`.
 * Запуск: `pnpm test:int` при поднятой БД с применёнными миграциями
 * (`docker compose up -d postgres && pnpm prisma:migrate`).
 */
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testRegex: 'src/.*\\.int-spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  setupFiles: ['<rootDir>/test/load-env.ts'],
  testTimeout: 30000,
};
