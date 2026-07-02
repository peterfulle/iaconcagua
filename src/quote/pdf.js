import { htmlToPdf } from '../scraper/browser.js';
import { valorUF } from '../tools/uf.js';

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
 * datos: { proyecto, ubicacion, tipologia, dormitorios, banos, superficie_m2,
 *          precio_uf, cliente_nombre, cliente_email, url }
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

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1f2937; margin: 0; font-size: 13px; }
  .brand { background: #0b3b6f; color: #fff; padding: 22px 26px; display: flex; justify-content: space-between; align-items: center; }
  .brand h1 { margin: 0; font-size: 20px; letter-spacing: .3px; }
  .brand .sub { font-size: 11px; opacity: .85; }
  .brand .doc { text-align: right; font-size: 11px; }
  .brand .doc b { font-size: 13px; }
  .wrap { padding: 26px; }
  h2 { color: #0b3b6f; font-size: 15px; margin: 22px 0 8px; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; }
  td.k { color: #6b7280; width: 38%; padding: 7px 0; }
  td.v { font-weight: 600; padding: 7px 0; }
  .cliente td { padding: 5px 0; }
  .precio { margin-top: 14px; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; }
  .precio .row { display: flex; justify-content: space-between; padding: 12px 16px; }
  .precio .row + .row { border-top: 1px solid #eef2f7; }
  .precio .total { background: #f0f6ff; }
  .precio .total .big { font-size: 22px; color: #0b3b6f; font-weight: 800; }
  .muted { color: #6b7280; font-size: 11px; }
  .nota { margin-top: 18px; background: #fafafa; border: 1px solid #eee; border-radius: 8px; padding: 12px 14px; font-size: 11px; color: #555; line-height: 1.5; }
  .foot { margin-top: 22px; text-align: center; color: #9ca3af; font-size: 10.5px; }
  .pill { display:inline-block; background:#e8f0fe; color:#0b3b6f; border-radius:999px; padding:3px 10px; font-size:11px; font-weight:600; }
</style></head><body>
  <div class="brand">
    <div>
      <h1>Inmobiliaria Aconcagua</h1>
      <div class="sub">Venta de casas y departamentos · iaconcagua.com</div>
    </div>
    <div class="doc">
      COTIZACIÓN<br><b>${cotizacion.folio}</b><br>${cotizacion.fecha}
    </div>
  </div>

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
      Inmobiliaria Aconcagua · 35 años de experiencia · www.iaconcagua.com<br>
      Documento generado automáticamente el ${cotizacion.fecha}.
    </div>
  </div>
</body></html>`;

  const buffer = await htmlToPdf(html);
  return { buffer, cotizacion };
}
