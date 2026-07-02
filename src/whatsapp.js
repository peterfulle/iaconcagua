import { rm } from 'node:fs/promises';
import qrcode from 'qrcode-terminal';
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

const logger = pino({ level: 'silent' });

// Estado observable (para el endpoint de salud).
let _status = 'iniciando';
let _pairingCode = null;
export function getWaStatus() {
  return { status: _status, pairingCode: _pairingCode, number: config.pairNumber || null };
}

/**
 * Inicia el socket de WhatsApp y llama a onMessage({ chatId, sender, text, isGroup, reply })
 * por cada mensaje entrante de texto.
 */
export async function startWhatsApp(onMessage) {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    browser: Browsers.macOS('Desktop'),
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
      console.log('\n📱 Escanea este QR con WhatsApp (Dispositivos vinculados):\n');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'open') {
      _status = 'conectado';
      _pairingCode = null;
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

        const reply = makeReplier(sock, chatId, m);

        await onMessage({ chatId, sender, text: text.trim(), isGroup, mentioned, reply });
      } catch (err) {
        console.error('Error procesando mensaje:', err.message);
      }
    }
  });

  return sock;
}

/** Crea una función reply() que simula presencia humana (leído + "escribiendo…"). */
function makeReplier(sock, chatId, incoming) {
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
        await sock.sendPresenceUpdate('composing', chatId);
      } catch {
        /* ok */
      }
      await new Promise((r) => setTimeout(r, wait));
      await sock.sendMessage(chatId, { text: texto });
      try {
        await sock.sendPresenceUpdate('paused', chatId);
      } catch {
        /* ok */
      }
      if (i < list.length - 1) await new Promise((r) => setTimeout(r, 400));
    }
  };
}
