import { generarCotizacionPDF } from './pdf.js';
import { enviarEmail } from './email.js';
import { config } from '../config.js';

const clp = (n) => '$' + Math.round(n).toLocaleString('es-CL');
const VERDE = '#1A963A';
const LIMA = '#8DC703';
const GRIS = '#414141';

/**
 * Genera el PDF de cotización y lo envía por email al cliente.
 * Devuelve { cotizacion, filename, email }.
 */
export async function enviarCotizacionPorEmail(datos) {
  const { buffer, cotizacion } = await generarCotizacionPDF(datos);
  const filename = `Cotizacion-${cotizacion.folio}.pdf`;

  const logoUrl = `${config.publicUrl}/logo.png`;
  const html = `
  <div style="background:#f3f6ef;padding:24px 0;font-family:'Open Sans Condensed','Arial Narrow',Arial,sans-serif">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e6ece0">
      <div style="padding:20px 24px 12px">
        <img src="${logoUrl}" alt="Inmobiliaria Aconcagua" height="30" style="height:30px">
      </div>
      <div style="height:5px;background:linear-gradient(90deg,${VERDE} 0%,${VERDE} 55%,${LIMA} 100%)"></div>
      <div style="padding:22px 24px;color:${GRIS};font-size:15px;line-height:1.5">
        <p>Hola ${cotizacion.cliente_nombre || ''},</p>
        <p>Adjunto tu <b>cotización referencial</b> del proyecto
        <b style="color:${VERDE}">${cotizacion.proyecto}</b>${cotizacion.tipologia ? ` · ${cotizacion.tipologia}` : ''}.</p>

        <div style="background:#f2f8e8;border:1px solid #e0ecca;border-radius:10px;padding:16px 18px;margin:16px 0">
          <div style="color:#6b7280;font-size:13px;text-transform:uppercase;letter-spacing:.5px">Total estimado</div>
          <div style="color:${VERDE};font-size:28px;font-weight:700">${clp(cotizacion.precio_clp)}</div>
          <div style="color:#6b7280;font-size:13px">UF ${cotizacion.precio_uf.toLocaleString('es-CL')} · valor UF ${cotizacion.fecha_uf}: ${clp(cotizacion.valor_uf)}</div>
        </div>

        <p style="color:#6b7280;font-size:12px">Valor referencial; la UF varía a diario y el monto final lo
        confirma un ejecutivo. Cotización N° ${cotizacion.folio}.</p>
        <p>¡Cualquier duda respóndeme este correo! 🏡</p>
      </div>
      <div style="background:#f8faf5;border-top:1px solid #eef3ea;padding:14px 24px;color:#8e8e8e;font-size:12px;text-align:center">
        <b style="color:${VERDE}">Inmobiliaria Aconcagua</b> · 35 años de experiencia · www.iaconcagua.com
      </div>
    </div>
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
