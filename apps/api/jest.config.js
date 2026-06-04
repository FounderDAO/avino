/**
 * Jest-конфиг для @avino/api (TASK-041).
 *
 * ts-jest исполняет TypeScript напрямую (без отдельной сборки). Тесты лежат
 * рядом с кодом как `*.spec.ts`. tsconfig берётся проектный (decorators и т.д.).
 */
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
};
