import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// Минимальный харнесс (пока только чистые модули — адаптеры): node-env,
// без jsdom/RTL. Компонентных тестов в apps/web ещё нет — появятся, добавим
// jsdom по образцу apps/client/vitest.config.mts.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globals: true,
  },
});
