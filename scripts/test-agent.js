// Simula una conversación con la asesora (sin WhatsApp), para verificar el cerebro end-to-end.
import { responder } from '../src/agent.js';
import { closeBrowser } from '../src/scraper/browser.js';

const chat = 'test-cli';
const mensajes = process.argv.slice(2).length
  ? [process.argv.slice(2).join(' ')]
  : [
      'Hola! busco depto de 3 dormitorios en Quilicura, ¿qué tienen y a qué precio?',
    ];

try {
  for (const msg of mensajes) {
    console.log(`\n👤 ${msg}`);
    const t0 = Date.now();
    const r = await responder(chat, msg);
    console.log(`\n🤖 (${((Date.now() - t0) / 1000).toFixed(1)}s)\n${r}`);
  }
} catch (e) {
  console.error('ERR', e);
} finally {
  await closeBrowser();
  process.exit(0);
}
