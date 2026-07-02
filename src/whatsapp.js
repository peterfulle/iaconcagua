import { rm } from 'node:fs/promises';
import qrcode from 'qrcode-terminal';
import QR from 'qrcode';
import pino from 'pino';
import { config } from './config.js';
import baileys, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
} from '@whiskeysockets/baileys';

const makeWASocket = baileys.default || baileys;
const AUTH_DIR = config.authDir;

// Proxy opcional (residencial/móvil) para que WhatsApp no vea una IP de datacenter.
async function buildProxyAgent() {
  if (!config.proxyUrl) return undefined;
  try {
    if (config.proxyUrl.startsWith('socks')) {
      const { SocksProxyAgent } = await import('socks-proxy-agent');
      return new SocksProxyAgent(config.proxyUrl);
    }
    const { HttpsProxyAgent } = await import('https-proxy-agent');
    return new HttpsProxyAgent(config.proxyUrl);
  } catch (e) {
    console.error('No pude configurar el proxy:', e?.message || e);
    return undefined;
  }
}

const logger = pino({ level: 'silent' });

// Estado observable (para el endpoint de salud).
let _status = 'iniciando';
let _pairingCode = null;
let _qrDataUrl = null;
export function getWaStatus() {
  return {
    status: _status,
    pairingCode: _pairingCode,
    qrDataUrl: _qrDataUrl,
    number: config.pairNumber || null,
  };
}

/**
 * Inicia el socket de WhatsApp y llama a onMessage({ chatId, sender, text, isGroup, reply })
 * por cada mensaje entrante de texto.
 */
export async function startWhatsApp(onMessage) {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();
  const agent = await buildProxyAgent();
  if (agent) console.log('🌐 Usando proxy para WhatsApp');

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    browser: Browsers.macOS('Desktop'),
    agent,
    fetchAgent: agent,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
  });

  sock.ev.on('creds.update', saveCreds);

  // Vinculación por CÓDIGO DE 8 DÍGITOS (si defines PAIR_NUMBER en .env).
  const usarCodigo = Boolean(config.pairNumber) && !sock.authState.creds.registered;
  if (usarCodigo) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(config.pairNumber);
        const pretty = code.match(/.{1,4}/g)?.join('-') || code;
        _pairingCode = pretty;
        _status = 'esperando_vinculacion';
        console.log('\n════════════════════════════════════════');
        console.log('📲 VINCULAR CON NÚMERO DE TELÉFONO');
        console.log(`   Número: +${config.pairNumber}`);
        console.log(`   CÓDIGO: ${pretty}`);
        console.log('════════════════════════════════════════');
        console.log('En tu teléfono: WhatsApp → Dispositivos vinculados →');
        console.log('Vincular un dispositivo → "Vincular con número de teléfono"');
        console.log('y escribe el código de arriba.\n');
      } catch (e) {
        console.error('No pude generar el código de vinculación:', e.message);
      }
    }, 3000);
  }

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr && !usarCodigo) {
      _status = 'esperando_qr';
      console.log('\n📱 Escanea este QR con WhatsApp (Dispositivos vinculados):\n');
      qrcode.generate(qr, { small: true });
      QR.toDataURL(qr, { margin: 1, width: 320 })
        .then((url) => {
          _qrDataUrl = url;
        })
        .catch(() => {});
    }
    if (connection === 'open') {
      _status = 'conectado';
      _pairingCode = null;
      _qrDataUrl = null;
      console.log('✅ WhatsApp conectado. El agente está en línea.\n');
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      if (loggedOut) {
        // Sesión inválida (401): auto-sanar → borrar y volver a pedir código.
        _status = 'regenerando_sesion';
        console.log('🔁 Sesión cerrada por WhatsApp (401). Limpiando y generando código nuevo…');
        rm(AUTH_DIR, { recursive: true, force: true })
          .catch(() => {})
          .finally(() => {
            setTimeout(() => {
              startWhatsApp(onMessage).catch((e) =>
                console.error('Fallo al regenerar sesión:', e.message)
              );
            }, 2000);
          });
      } else {
        _status = 'reconectando';
        console.log(`⚠️  Conexión cerrada (código ${code}). Reintentando en 3s…`);
        setTimeout(() => {
          startWhatsApp(onMessage).catch((e) =>
            console.error('Fallo al reconectar:', e.message)
          );
        }, 3000);
      }
    }
  });

  // Evita que un 'error' del websocket tumbe el proceso.
  sock.ev.on('connection.update', () => {});
  sock.ws?.on?.('error', (e) => console.error('WS error:', e?.message || e));

  // Acuses de entrega: 0=pending 1=servidor 2=ENTREGADO 3=leído 4=reproducido.
  const ACK = { 0: 'pendiente', 1: 'servidor', 2: 'ENTREGADO', 3: 'leído', 4: 'reproducido' };
  sock.ev.on('messages.update', (updates) => {
    for (const u of updates) {
      const s = u.update?.status;
      if (s !== undefined) console.log(`📬 ack ${u.key?.id}: ${ACK[s] || s}`);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) {
      try {
        if (!m.message || m.key.fromMe) continue;
        const chatId = m.key.remoteJid;
        if (!chatId || chatId === 'status@broadcast') continue;

        const isGroup = chatId.endsWith('@g.us');
        const sender = m.key.participant || chatId;
        const text =
          m.message.conversation ||
          m.message.extendedTextMessage?.text ||
          m.message.imageMessage?.caption ||
          m.message.videoMessage?.caption ||
          '';
        if (!text.trim()) continue;

        const mentioned = (
          m.message.extendedTextMessage?.contextInfo?.mentionedJid || []
        ).includes(sock.user?.id?.replace(/:\d+/, '') || '');

        // DIAGNÓSTICO: registra todos los identificadores del remitente.
        console.log('🔑 key=', JSON.stringify(m.key));

        // WhatsApp puede entregar el remitente como @lid (privacidad de número).
        // Enviamos a TODOS los JID candidatos para descartar problemas de mapeo.
        const targets = destinosRespuesta(m, isGroup);
        console.log('🎯 targets=', targets.join(', '));
        const reply = makeReplier(sock, targets, m);

        await onMessage({ chatId, sender, text: text.trim(), isGroup, mentioned, reply });
      } catch (err) {
        console.error('Error procesando mensaje:', err.message);
      }
    }
  });

  return sock;
}

/**
 * Devuelve la lista de JID candidatos a los que responder (sin duplicados).
 * En grupos, solo el grupo. En DM, el remoteJid original + cualquier JID de teléfono.
 */
function destinosRespuesta(m, isGroup) {
  const k = m.key || {};
  if (isGroup) return [k.remoteJid].filter(Boolean);
  const candidatos = [k.remoteJid, k.remoteJidAlt, k.senderPn, k.participantAlt, k.participant];
  return [...new Set(candidatos.filter((j) => typeof j === 'string' && j))];
}

/** Crea una función reply() que simula presencia humana (leído + "escribiendo…"). */
function makeReplier(sock, targets, incoming) {
  const jids = Array.isArray(targets) ? targets : [targets];
  const primary = jids[0];
  return async function reply(chunks, { typingMs = 1200 } = {}) {
    const list = Array.isArray(chunks) ? chunks : [chunks];
    try {
      await sock.readMessages([incoming.key]);
    } catch {
      /* ok */
    }
    for (let i = 0; i < list.length; i++) {
      const texto = list[i];
      const wait = typeof typingMs === 'function' ? typingMs(texto) : typingMs;
      try {
        await sock.sendPresenceUpdate('composing', primary);
      } catch {
        /* ok */
      }
      await new Promise((r) => setTimeout(r, wait));
      // Envía a todos los JID candidatos (diagnóstico de mapeo @lid).
      for (const jid of jids) {
        try {
          const r = await sock.sendMessage(jid, { text: texto });
          console.log(`📤 enviado a ${jid} (id ${r?.key?.id || '?'})`);
        } catch (e) {
          console.error(`❌ fallo al enviar a ${jid}:`, e?.message || e);
        }
      }
      try {
        await sock.sendPresenceUpdate('paused', primary);
      } catch {
        /* ok */
      }
      if (i < list.length - 1) await new Promise((r) => setTimeout(r, 400));
    }
  };
}
