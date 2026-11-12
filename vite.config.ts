/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { mkdirSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const LARGE_ASSET_BYTES = 256 * 1024;

/**
 * T0-0 探针专用：构建时生成一个较大的静态资源与一份产物清单，
 * 用来实测托管站的单资源下载与包体大小。产物只落在 dist（已 gitignore），不进仓库。
 */
function probeAssets(): Plugin {
  let outDir = 'dist';
  return {
    name: 'vein-probe-assets',
    apply: 'build',
    configResolved(cfg) {
      outDir = join(cfg.root, cfg.build.outDir);
    },
    writeBundle() {
      const dir = join(outDir, 'probe');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'large.txt'), 'v'.repeat(LARGE_ASSET_BYTES));

      const walk = (d: string, base = ''): { name: string; bytes: number }[] => {
        const out: { name: string; bytes: number }[] = [];
        for (const e of readdirSync(d, { withFileTypes: true })) {
          const rel = base ? `${base}/${e.name}` : e.name;
          if (e.isDirectory()) out.push(...walk(join(d, e.name), rel));
          else out.push({ name: rel, bytes: statSync(join(d, e.name)).size });
        }
        return out;
      };
      const files = walk(outDir).sort((a, b) => b.bytes - a.bytes);
      writeFileSync(
        join(dir, 'build-info.json'),
        JSON.stringify(
          { builtAt: new Date().toISOString(), largeAssetBytes: LARGE_ASSET_BYTES,
            totalBytes: files.reduce((s, f) => s + f.bytes, 0), files },
          null, 2,
        ),
      );
    },
  };
}

export default defineConfig({
  root: 'apps/web',
  plugins: [react(), probeAssets()],
  build: { outDir: 'dist', sourcemap: false },
  test: {
    // root 是 apps/web，所以这里的路径相对它写
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
