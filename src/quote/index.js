import { generarCotizacionPDF } from './pdf.js';
import { enviarEmail } from './email.js';

const clp = (n) => '$' + Math.round(n).toLocaleString('es-CL');

/**
 * Genera el PDF de cotización y lo envía por email al cliente.
 * Devuelve { cotizacion, filename, email }.
 */
export async function enviarCotizacionPorEmail(datos) {
  const { buffer, cotizacion } = await generarCotizacionPDF(datos);
  const filename = `Cotizacion-${cotizacion.folio}.pdf`;

  const html = `
    <div style="font-family:system-ui,Arial,sans-serif;color:#1f2937;max-width:560px">
      <h2 style="color:#0b3b6f">Inmobiliaria Aconcagua</h2>
      <p>Hola ${cotizacion.cliente_nombre || ''},</p>
      <p>Adjunto tu cotización referencial del proyecto <b>${cotizacion.proyecto}</b>
      ${cotizacion.tipologia ? `(${cotizacion.tipologia})` : ''}.</p>
      <p style="font-size:18px"><b>Total estimado: ${clp(cotizacion.precio_clp)}</b>
      <br><span style="color:#6b7280;font-size:13px">UF ${cotizacion.precio_uf.toLocaleString('es-CL')} ·
      valor UF ${cotizacion.fecha_uf}: ${clp(cotizacion.valor_uf)}</span></p>
      <p style="color:#6b7280;font-size:12px">Valor referencial; la UF varía a diario y el monto final lo
      confirma un ejecutivo. Cotización N° ${cotizacion.folio}.</p>
      <p>¡Cualquier duda respóndeme este correo! 🏡</p>
    </div>`;

  const email = await enviarEmail({
    to: datos.cliente_email,
    subject: `Tu cotización de ${cotizacion.proyecto} · Inmobiliaria Aconcagua`,
    html,
    attachments: [{ filename, content: buffer }],
  });

  return { cotizacion, filename, email };
}

export { generarCotizacionPDF } from './pdf.js';
