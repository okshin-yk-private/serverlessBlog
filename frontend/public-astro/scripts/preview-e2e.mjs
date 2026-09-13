import { preview } from 'astro';

// Keep the server in Playwright's process tree. The Astro CLI can daemonize
// automatically in an agent environment, which makes webServer exit early.
const server = await preview({ server: { host: 'localhost', port: 3000 } });

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await server.stop();
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
