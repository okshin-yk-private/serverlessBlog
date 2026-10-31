import { defineConfig, mergeConfig } from 'vite';
import config from './vite.config';

// Local-only production-shaped build including MSW. Never used by deploy.yml.
export default defineConfig((env) => {
  const base = typeof config === 'function' ? config(env) : config;
  return mergeConfig(base, {
    build: {
      outDir: 'dist-csp-test',
      rollupOptions: { external: () => false },
    },
  });
});
