import { spawnSync } from 'node:child_process';

const registry = process.env.PUBLISH_REGISTRY ?? process.env.NPM_REGISTRY;

if (!registry) {
  console.error('[publish] Missing required PUBLISH_REGISTRY or NPM_REGISTRY environment variable.');
  process.exit(1);
}

const args = ['publish', `--registry=${registry}`, ...process.argv.slice(2)];

console.log(`[publish] Using registry: ${registry}`);

const result = spawnSync('npm', args, { stdio: 'inherit', shell: process.platform === 'win32' });

if (result.error) {
  console.error('[publish] Failed to execute npm publish:', result.error);
  process.exit(result.status ?? 1);
}

process.exit(result.status ?? 0);
