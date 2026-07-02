import http from 'node:http';
import { config } from './config.js';
import { startWhatsApp, getWaStatus } from './whatsapp.js';
import { responder } from './agent.js';
import { splitMessage, typingDelay } from './humanize.js';
import { closeBrowser } from './scraper/browser.js';

// Servidor de salud: Render (Web Service) necesita un puerto abierto.
// Además muestra el estado de WhatsApp y el código de vinculación.
function startHealthServer() {
  const server = http.createServer((req, res) => {
    const wa = getWaStatus();
    if (req.url === '/health' || req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, wa }));
    }
    const codigoHtml =
      wa.status === 'esperando_vinculacion' && wa.pairingCode
        ? `<p>📲 <b>Vincular con número</b> (+${wa.number})<br>
             En WhatsApp → Dispositivos vinculados → Vincular un dispositivo →
             "Vincular con número de teléfono" y escribe:</p>
           <p style="font-size:2rem;letter-spacing:.2rem"><b>${wa.pairingCode}</b></p>`
        : '';
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><meta charset="utf-8">
      <title>Agente Aconcagua</title>
      <body style="font-family:system-ui;max-width:640px;margin:3rem auto;padding:0 1rem">
      <h1>🏠 Agente Inmobiliario Aconcagua</h1>
      <p>Estado WhatsApp: <b>${wa.status}</b></p>
      ${codigoHtml}
      <p style="color:#888">Modelo ${config.model} · effort ${config.effort}</p>
      </body>`);
  });
  server.listen(config.port, () => {
    console.log(`🩺 Servidor de salud en puerto ${config.port} (/health)`);
  });
}

// Evita procesar 2 mensajes del mismo chat en paralelo (respuestas ordenadas).
const enProceso = new Set();

function debeResponderEnGrupo({ text, mentioned }) {
  if (config.groupMode === 'always') return true;
  if (mentioned) return true;
  const low = text.toLowerCase();
  return config.groupTriggers.some((t) => low.includes(t));
}

async function onMessage({ chatId, sender, text, isGroup, mentioned, reply }) {
  if (isGroup) {
    if (config.allowedGroups.length && !config.allowedGroups.includes(chatId.toLowerCase()))
      return;
    if (!debeResponderEnGrupo({ text, mentioned })) return;
  }

  // Clave de contexto: en grupos, memoria por (grupo+persona); en DM, por chat.
  const contextId = isGroup ? `${chatId}:${sender}` : chatId;

  if (enProceso.has(contextId)) return;
  enProceso.add(contextId);

  const etiqueta = isGroup ? `${chatId} · ${sender}` : chatId;
  console.log(`💬 [${etiqueta}] ${text}`);

  try {
    const respuesta = await responder(contextId, text);
    console.log(`🤖 [${etiqueta}] ${respuesta.replace(/\n/g, ' ⏎ ')}`);
    await reply(splitMessage(respuesta), { typingMs: typingDelay });
  } catch (err) {
    console.error('Error generando respuesta:', err);
    await reply('Disculpa, se me cayó la señal un segundo 🙈 ¿me lo repites?');
  } finally {
    enProceso.delete(contextId);
  }
}

async function main() {
  console.log('🏠 Agente Inmobiliario Aconcagua — iniciando…');
  console.log(`   Modelo: ${config.model} (effort ${config.effort})`);
  console.log(`   Navegador headless: ${config.headless}`);
  startHealthServer();
  await startWhatsApp(onMessage);
}

async function shutdown() {
  console.log('\n👋 Cerrando…');
  await closeBrowser();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Resiliencia: los cortes transitorios de WhatsApp no deben tumbar el proceso.
process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection:', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err?.message || err);
  // En la nube (Render) el contenedor se reinicia solo y la sesión persiste en disco.
});

main().catch((err) => {
  console.error('Fallo al iniciar:', err);
  process.exit(1);
});
