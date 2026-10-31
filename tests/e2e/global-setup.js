import { execSync } from 'node:child_process';
import { startServers } from './server.js';

// Builds the end-to-end variant (the store build comes from `pnpm build` in test:e2e) and
// serves the fixtures for the whole run.
export default async function globalSetup() {
  execSync('pnpm wxt build', { stdio: 'inherit', env: { ...process.env, WXT_E2E: '1' } });
  // The CLI specs run the bundled CLI, which must match the current source.
  execSync('pnpm cli:build', { stdio: 'inherit' });
  const stop = await startServers();
  return async () => stop();
}
