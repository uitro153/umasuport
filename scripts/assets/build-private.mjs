import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';

// Explicit local validation output. Vite additionally rejects public outDirs.
const result = spawnSync(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'build'], {
  env: { ...process.env, VITE_PRIVATE_ASSET_VALIDATION: '1' },
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
