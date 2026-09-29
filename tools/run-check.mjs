import { spawnSync } from 'node:child_process';
const manager = process.env.npm_execpath;
if (!manager) throw new Error('Run this script through pnpm');
for (const task of ['lint', 'typecheck', 'test', 'build']) {
  const javascript = /\.[cm]?js$/i.test(manager);
  const result = spawnSync(javascript ? process.execPath : manager,
    javascript ? [manager, 'run', task] : ['run', task],
    { stdio: 'inherit', env: process.env, shell: process.platform === 'win32' && /\.cmd$/i.test(manager) });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
