import 'dotenv/config';
import { config, printBanner } from './config.js';
import { buildApp } from './app.js';

async function main() {
  printBanner();

  const app = await buildApp();

  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
    console.log(`Server listening on http://0.0.0.0:${config.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      console.log(`\nReceived ${signal}, shutting down...`);
      await app.close();
      process.exit(0);
    });
  }
}

main();
