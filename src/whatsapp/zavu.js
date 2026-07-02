import { config } from '../config.js';
import { responder } from '../agent.js';
import { splitMessage } from '../humanize.js';

const API = 'https://api.zavu.dev/v1/messages';
const procesados = new Set(); // dedup por messageId

function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => resolve(b));
  });
}

/** Envía un mensaje de WhatsApp por Zavu. */
export async function sendZavu(to, text) {
  if (!config.zavuApiKey) {
    console.error('ZAVU_API_KEY no configurada');
    return;
  }
  try {
    const headers = {
      Authorization: `Bearer ${config.zavuApiKey}`,
      'content-type': 'application/json',
    };
    if (config.zavuSender) headers['Zavu-Sender'] = config.zavuSender;
    const res = await fetch(API, {
      method: 'POST',
      headers,
      body: JSON.stringify({ to, text, channel: 'whatsapp' }),
    });
    if (!res.ok) {
      const t = await res.text();
      console.error(`Zavu send ${res.status}: ${t.slice(0, 200)}`);
    } else {
      console.log(`📤 (Zavu) enviado a ${to}`);
    }
  } catch (e) {
    console.error('Zavu send error:', e.message);
  }
}

async function procesarInbound(raw) {
  let evt;
  try {
    evt = JSON.parse(raw);
  } catch {
    return;
  }
  if (evt.type !== 'message.inbound') return;
  const d = evt.data || {};
  if (d.channel !== 'whatsapp') return;
  const from = d.from;
  const text = d.text;
  const mid = d.messageId || evt.id;
  if (!from || !text || d.messageType !== 'text') return;
  if (mid && procesados.has(mid)) return; // evita reprocesar reintentos
  if (mid) {
    procesados.add(mid);
    if (procesados.size > 5000) procesados.clear();
  }

  console.log(`💬 (Zavu WA) ${from}: ${text}`);
  try {
    const respuesta = await responder(from, text, 'whatsapp');
    for (const chunk of splitMessage(respuesta)) {
      await sendZavu(from, chunk);
    }
  } catch (e) {
    console.error('Error procesando inbound Zavu:', e.message);
    await sendZavu(from, 'Disculpa, tuve un problema 🙈 ¿me lo repites?');
  }
}

/** Maneja el webhook de Zavu en /webhook/zavu. Devuelve true si atendió la request. */
export async function handleZavuWebhook(req, res) {
  const url = new URL(req.url, 'http://x');
  if (url.pathname !== '/webhook/zavu') return false;

  if (req.method !== 'POST') {
    res.writeHead(200);
    res.end('zavu webhook ok');
    return true;
  }

  const raw = await readBody(req);
  // Responde 200 de inmediato (el agente tarda; evita timeouts/reintentos de Zavu).
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ received: true }));

  // Procesa en segundo plano.
  procesarInbound(raw).catch((e) => console.error('inbound async:', e.message));
  return true;
}
