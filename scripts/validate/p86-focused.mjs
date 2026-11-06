import process from 'node:process';
import { spawn } from 'node:child_process';

// The complete 108-case run is preserved separately. Recheck its ten remaining
// migrated selectors, the final tree/PNG geometry, and new integration flows.
// Saved-plan UI entry/restore (the other two failures) is a separate paired run.
const files = ['lineage.spec.ts', 'p41.spec.ts', 'p5.spec.ts', 'p7.spec.ts',
  'p85-images-output.spec.ts', 'p86-lineage-geometry.spec.ts', 'p86-integration.spec.ts',
  'p86-automation.spec.ts', 'p86-user-flow.spec.ts'];
const pattern = 'lineage.spec.ts.*깊은|p41.spec.ts|p5.spec.ts.*44|p7.spec.ts.*깊은|p85-images-output.spec.ts|p86-(lineage-geometry|integration|automation|user-flow).spec.ts';
const child = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', ...files,
  '--grep', pattern, '--output', '.preview/p86-final-focused-results'], { stdio: 'inherit', windowsHide: true });
child.on('error', error => { process.stderr.write(String(error) + '\n'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
