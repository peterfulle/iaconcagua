import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

// Asegura el directorio del archivo (en Render: /data).
try {
  mkdirSync(path.dirname(config.dbPath), { recursive: true });
} catch {
  /* ok */
}

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT UNIQUE,
    canal TEXT,
    nombre TEXT,
    rut TEXT,
    telefono TEXT,
    email TEXT,
    proyecto_interes TEXT,
    comuna TEXT,
    presupuesto_uf REAL,
    dormitorios TEXT,
    estado TEXT DEFAULT 'nuevo',
    score TEXT DEFAULT 'tibio',
    notas TEXT,
    cotizaciones INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS mensajes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER,
    rol TEXT,
    texto TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_msg_lead ON mensajes(lead_id);
`);

const CAMPOS = [
  'nombre', 'rut', 'telefono', 'email', 'proyecto_interes',
  'comuna', 'presupuesto_uf', 'dormitorios', 'estado', 'score', 'notas',
];

export function getOrCreateLead(chatId, canal = 'whatsapp') {
  let lead = db.prepare('SELECT * FROM leads WHERE chat_id = ?').get(chatId);
  if (!lead) {
    db.prepare('INSERT INTO leads (chat_id, canal) VALUES (?, ?)').run(chatId, canal);
    lead = db.prepare('SELECT * FROM leads WHERE chat_id = ?').get(chatId);
  }
  return lead;
}

/** Actualiza sólo los campos presentes (no null/undefined/'') de `data`. */
export function upsertLeadData(chatId, canal, data = {}) {
  const lead = getOrCreateLead(chatId, canal);
  const sets = [];
  const vals = [];
  for (const c of CAMPOS) {
    if (data[c] !== undefined && data[c] !== null && data[c] !== '') {
      sets.push(`${c} = ?`);
      vals.push(data[c]);
    }
  }
  if (sets.length) {
    sets.push(`updated_at = datetime('now','localtime')`);
    vals.push(lead.id);
    db.prepare(`UPDATE leads SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }
  return db.prepare('SELECT * FROM leads WHERE id = ?').get(lead.id);
}

export function addMessage(chatId, canal, rol, texto) {
  const lead = getOrCreateLead(chatId, canal);
  db.prepare('INSERT INTO mensajes (lead_id, rol, texto) VALUES (?, ?, ?)').run(lead.id, rol, texto);
  db.prepare(`UPDATE leads SET updated_at = datetime('now','localtime') WHERE id = ?`).run(lead.id);
}

export function marcarCotizacion(chatId, canal = 'whatsapp') {
  const lead = getOrCreateLead(chatId, canal);
  db.prepare(
    `UPDATE leads SET cotizaciones = cotizaciones + 1, score = 'caliente', updated_at = datetime('now','localtime') WHERE id = ?`
  ).run(lead.id);
  return db.prepare('SELECT * FROM leads WHERE id = ?').get(lead.id);
}

export function listLeads({ q, estado, score } = {}) {
  let sql = 'SELECT * FROM leads WHERE 1=1';
  const vals = [];
  if (q) {
    sql += ' AND (nombre LIKE ? OR telefono LIKE ? OR email LIKE ? OR proyecto_interes LIKE ?)';
    vals.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (estado) { sql += ' AND estado = ?'; vals.push(estado); }
  if (score) { sql += ' AND score = ?'; vals.push(score); }
  sql += ' ORDER BY updated_at DESC LIMIT 500';
  return db.prepare(sql).all(...vals);
}

export function getLead(id) {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
  if (!lead) return null;
  const mensajes = db.prepare('SELECT * FROM mensajes WHERE lead_id = ? ORDER BY id ASC').all(id);
  return { ...lead, mensajes };
}

export function updateEstado(id, estado) {
  db.prepare(`UPDATE leads SET estado = ?, updated_at = datetime('now','localtime') WHERE id = ?`).run(estado, id);
}

export function stats() {
  const total = db.prepare('SELECT COUNT(*) n FROM leads').get().n;
  const calientes = db.prepare("SELECT COUNT(*) n FROM leads WHERE score = 'caliente'").get().n;
  const nuevos = db.prepare("SELECT COUNT(*) n FROM leads WHERE estado = 'nuevo'").get().n;
  const conCotizacion = db.prepare('SELECT COUNT(*) n FROM leads WHERE cotizaciones > 0').get().n;
  return { total, calientes, nuevos, conCotizacion };
}

export function exportCsv() {
  const rows = db.prepare('SELECT * FROM leads ORDER BY created_at DESC').all();
  const cols = ['id', 'created_at', 'canal', 'nombre', 'rut', 'telefono', 'email', 'proyecto_interes', 'comuna', 'presupuesto_uf', 'dormitorios', 'estado', 'score', 'cotizaciones'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [cols.join(',')];
  for (const r of rows) lines.push(cols.map((c) => esc(r[c])).join(','));
  return lines.join('\n');
}

export default db;
