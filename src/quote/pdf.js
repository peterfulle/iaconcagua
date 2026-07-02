import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { htmlToPdf } from '../scraper/browser.js';
import { valorUF } from '../tools/uf.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Logo de iaconcagua embebido como data URI.
let LOGO_DATA_URI = '';
try {
  const logo = readFileSync(path.join(__dirname, '..', 'logo.png'));
  LOGO_DATA_URI = `data:image/png;base64,${logo.toString('base64')}`;
} catch {
  LOGO_DATA_URI = '';
}

// Paleta oficial iaconcagua.com
const VERDE = '#1A963A';
const LIMA = '#8DC703';
const GRIS = '#414141';
const GRIS2 = '#8e8e8e';

const clp = (n) => '$' + Math.round(n).toLocaleString('es-CL');
const uf = (n) => 'UF ' + Number(n).toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function folio() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `AC-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/**
 * Genera una cotización en PDF (Buffer) para una unidad, con UF del día en vivo.
 * Devuelve { buffer, cotizacion }.
 */
export async function generarCotizacionPDF(datos) {
  const ufHoy = await valorUF();
  const precioUF = Number(datos.precio_uf);
  const precioCLP = precioUF * ufHoy.valor;

  const cotizacion = {
    folio: folio(),
    fecha: new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' }),
    ...datos,
    precio_uf: precioUF,
    valor_uf: ufHoy.valor,
    fecha_uf: ufHoy.fecha,
    precio_clp: precioCLP,
    validez_dias: 7,
  };

  const filas = [
    ['Proyecto', esc(datos.proyecto)],
    ['Ubicación', esc(datos.ubicacion || '—')],
    ['Tipología', esc(datos.tipologia || '—')],
    datos.dormitorios ? ['Dormitorios', esc(datos.dormitorios)] : null,
    datos.banos ? ['Baños', esc(datos.banos)] : null,
    datos.superficie_m2 ? ['Superficie', `${esc(datos.superficie_m2)} m²`] : null,
  ]
    .filter(Boolean)
    .map(([k, v]) => `<tr><td class="k">${k}</td><td class="v">${v}</td></tr>`)
    .join('');

  const logoHtml = LOGO_DATA_URI
    ? `<img src="${LOGO_DATA_URI}" alt="Inmobiliaria Aconcagua" style="height:34px">`
    : `<div style="font-size:22px;font-weight:700;color:${VERDE}">iaconcagua<span style="color:${GRIS}">.com</span></div>`;

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Open+Sans+Condensed:ital,wght@0,300;0,700;1,300&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  body { font-family: "Open Sans Condensed", "Arial Narrow", Arial, sans-serif; color: ${GRIS}; margin: 0; font-size: 14px; }
  .top { display: flex; justify-content: space-between; align-items: center; padding: 24px 26px 16px; }
  .top .doc { text-align: right; font-size: 12px; color: ${GRIS2}; line-height: 1.5; }
  .top .doc b { color: ${VERDE}; font-size: 15px; letter-spacing: .5px; }
  .bar { height: 6px; background: linear-gradient(90deg, ${VERDE} 0%, ${VERDE} 55%, ${LIMA} 100%); }
  .wrap { padding: 22px 26px; }
  .pill { display:inline-block; background:${LIMA}; color:#1c3d00; border-radius:999px; padding:4px 12px; font-size:12px; font-weight:700; letter-spacing:.4px; text-transform:uppercase; }
  h2 { color: ${VERDE}; font-size: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px; margin: 22px 0 8px; border-bottom: 2px solid #eef3ea; padding-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; }
  td.k { color: ${GRIS2}; width: 38%; padding: 7px 0; }
  td.v { font-weight: 700; padding: 7px 0; }
  .cliente td { padding: 5px 0; }
  .precio { margin-top: 14px; border: 1px solid #e6ece0; border-radius: 12px; overflow: hidden; }
  .precio .row { display: flex; justify-content: space-between; align-items:center; padding: 13px 18px; }
  .precio .row + .row { border-top: 1px solid #eef3ea; }
  .precio .total { background: #f2f8e8; }
  .precio .total .big { font-size: 26px; color: ${VERDE}; font-weight: 700; letter-spacing:.5px; }
  .muted { color: ${GRIS2}; font-size: 12px; }
  .nota { margin-top: 18px; background: #f8faf5; border: 1px solid #eef3ea; border-left: 4px solid ${LIMA}; border-radius: 8px; padding: 12px 14px; font-size: 12px; color: #5c5c5c; line-height: 1.55; }
  .foot { margin-top: 24px; text-align: center; color: ${GRIS2}; font-size: 11px; }
  .foot b { color: ${VERDE}; }
</style></head><body>
  <div class="top">
    <div>${logoHtml}</div>
    <div class="doc">COTIZACIÓN<br><b>${cotizacion.folio}</b><br>${cotizacion.fecha}</div>
  </div>
  <div class="bar"></div>

  <div class="wrap">
    <span class="pill">Cotización referencial</span>

    <h2>Cliente</h2>
    <table class="cliente">
      <tr><td class="k">Nombre</td><td class="v">${esc(datos.cliente_nombre || '—')}</td></tr>
      <tr><td class="k">Email</td><td class="v">${esc(datos.cliente_email || '—')}</td></tr>
    </table>

    <h2>Unidad</h2>
    <table>${filas}</table>

    <h2>Valores</h2>
    <div class="precio">
      <div class="row"><span>Precio unidad</span><span><b>${uf(precioUF)}</b></span></div>
      <div class="row"><span>Valor UF del día (${esc(ufHoy.fecha)})</span><span>${clp(ufHoy.valor)}</span></div>
      <div class="row total"><span><b>Total estimado en pesos</b><br><span class="muted">${uf(precioUF)} × ${clp(ufHoy.valor)}</span></span><span class="big">${clp(precioCLP)}</span></div>
    </div>

    <div class="nota">
      <b>Importante:</b> Esta cotización es <b>referencial</b> y no constituye una oferta ni reserva.
      Los valores están expresados en UF; el monto final en pesos se determina según el valor de la UF
      a la fecha de pago, que varía diariamente. Precios, disponibilidad y condiciones sujetos a cambio
      sin previo aviso y a confirmación por un ejecutivo de Inmobiliaria Aconcagua. Validez: ${cotizacion.validez_dias} días.
      ${datos.url ? `<br>Ficha del proyecto: ${esc(datos.url)}` : ''}
    </div>

    <div class="foot">
      <b>Inmobiliaria Aconcagua</b> · 35 años de experiencia · www.iaconcagua.com<br>
      Documento generado automáticamente el ${cotizacion.fecha}.
    </div>
  </div>
</body></html>`;

  const buffer = await htmlToPdf(html);
  return { buffer, cotizacion };
}
