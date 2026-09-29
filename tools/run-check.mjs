import { spawnSync } from 'node:child_process';
const manager = process.env.npm_execpath;
if (!manager) throw new Error('Run this script through pnpm');
for (const task of ['lint', 'typecheck', 'test', 'build']) {
  const binary = manager.toLowerCase().endsWith('.exe');
  const result = spawnSync(binary ? manager : process.execPath, binary ? ['run', task] : [manager, 'run', task], { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
