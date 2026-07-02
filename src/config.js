import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function bool(v, def = false) {
  if (v === undefined) return def;
  return ['1', 'true', 'yes', 'si', 'sí'].includes(String(v).toLowerCase());
}

function list(v) {
  return String(v || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export const config = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  model: process.env.MODEL || 'claude-opus-4-8',
  effort: process.env.EFFORT || 'high',
  agentName: process.env.AGENT_NAME || 'Valentina',

  headless: bool(process.env.HEADLESS, true),

  // Si defines PAIR_NUMBER (número con código de país, solo dígitos, ej: 56912345678)
  // se vincula con un código de 8 dígitos en lugar de QR.
  pairNumber: String(process.env.PAIR_NUMBER || '').replace(/\D/g, ''),

  // Directorios de estado. En producción (Render) apúntalos a un disco
  // persistente, ej: AUTH_DIR=/data/auth_wa  BROWSER_DATA_DIR=/data/.browser_data
  authDir: process.env.AUTH_DIR || path.join(root, 'auth_wa'),
  browserDataDir: process.env.BROWSER_DATA_DIR || path.join(root, '.browser_data'),

  // Puerto para el pequeño servidor de salud (Render Web Service lo necesita).
  port: Number(process.env.PORT || 3000),

  // Proxy residencial/móvil para el socket de WhatsApp (evita el soft-ban de
  // datacenter). Ej: socks5://user:pass@host:puerto  o  http://user:pass@host:puerto
  proxyUrl: process.env.PROXY_URL || '',

  groupMode: (process.env.GROUP_MODE || 'mention').toLowerCase(),
  groupTriggers: list(process.env.GROUP_TRIGGERS),
  allowedGroups: list(process.env.ALLOWED_GROUPS),

  typing: {
    minMs: Number(process.env.TYPING_MIN_MS || 900),
    perCharMs: Number(process.env.TYPING_PER_CHAR_MS || 32),
    maxMs: Number(process.env.TYPING_MAX_MS || 6000),
  },

  site: {
    base: 'https://www.iaconcagua.com',
  },
};

if (!config.anthropicApiKey || config.anthropicApiKey.includes('...')) {
  console.error(
    '\n❌ Falta ANTHROPIC_API_KEY en .env. Genera una en https://console.anthropic.com y pégala en .env\n'
  );
  process.exit(1);
}
