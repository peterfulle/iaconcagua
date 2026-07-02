import { enviarEmail, emailConfigurado } from '../quote/email.js';
import { config } from '../config.js';

function destinoEjecutivo() {
  if (config.executiveEmail) return config.executiveEmail;
  const m = config.emailFrom.match(/<([^>]+)>/);
  return m ? m[1] : '';
}

/** Envía un aviso por email al ejecutivo cuando entra un lead caliente. */
export async function avisarLeadCaliente(lead, motivo = 'Nuevo lead caliente') {
  const to = destinoEjecutivo();
  if (!to || !emailConfigurado()) return;
  const VERDE = '#1A963A';
  const html = `
    <div style="font-family:'Open Sans Condensed',Arial,sans-serif;color:#414141;max-width:520px">
      <h2 style="color:${VERDE}">🔥 Lead caliente — ${motivo}</h2>
      <table style="border-collapse:collapse;font-size:15px">
        <tr><td style="color:#8e8e8e;padding:4px 12px 4px 0">Nombre</td><td><b>${lead.nombre || '—'}</b></td></tr>
        <tr><td style="color:#8e8e8e;padding:4px 12px 4px 0">Teléfono</td><td>${lead.telefono || '—'}</td></tr>
        <tr><td style="color:#8e8e8e;padding:4px 12px 4px 0">Email</td><td>${lead.email || '—'}</td></tr>
        <tr><td style="color:#8e8e8e;padding:4px 12px 4px 0">RUT</td><td>${lead.rut || '—'}</td></tr>
        <tr><td style="color:#8e8e8e;padding:4px 12px 4px 0">Proyecto</td><td>${lead.proyecto_interes || '—'}</td></tr>
        <tr><td style="color:#8e8e8e;padding:4px 12px 4px 0">Comuna</td><td>${lead.comuna || '—'}</td></tr>
        <tr><td style="color:#8e8e8e;padding:4px 12px 4px 0">Presupuesto</td><td>${lead.presupuesto_uf ? 'UF ' + lead.presupuesto_uf : '—'}</td></tr>
      </table>
      <p style="color:#8e8e8e;font-size:13px">Canal: ${lead.canal} · Cotizaciones: ${lead.cotizaciones || 0}</p>
      <p><a href="${config.publicUrl}/admin" style="color:${VERDE}">Ver en el panel →</a></p>
    </div>`;
  try {
    await enviarEmail({ to, subject: `🔥 Lead caliente: ${lead.nombre || lead.telefono || 'nuevo'}`, html, attachments: [] });
  } catch (e) {
    console.error('Aviso lead caliente falló:', e.message);
  }
}
