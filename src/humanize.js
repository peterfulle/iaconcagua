import { config } from './config.js';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Tiempo de "escritura" proporcional al largo del texto, con algo de azar. */
export function typingDelay(text) {
  const { minMs, perCharMs, maxMs } = config.typing;
  const base = minMs + (text?.length || 0) * perCharMs;
  const jitter = base * (0.85 + Math.random() * 0.35);
  return Math.min(Math.round(jitter), maxMs);
}

/** Divide una respuesta larga en varios mensajes de chat más naturales. */
export function splitMessage(text, maxLen = 600) {
  const clean = String(text || '').trim();
  if (clean.length <= maxLen) return [clean];

  const parrafos = clean.split(/\n{2,}/);
  const chunks = [];
  let buf = '';
  for (const p of parrafos) {
    if ((buf + '\n\n' + p).trim().length > maxLen && buf) {
      chunks.push(buf.trim());
      buf = p;
    } else {
      buf = buf ? `${buf}\n\n${p}` : p;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks.length ? chunks : [clean.slice(0, maxLen)];
}
