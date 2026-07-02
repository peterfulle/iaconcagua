// Genera un PDF de cotización de ejemplo (con datos reales) y lo guarda en disco.
// Si hay email configurado y pasas un correo, también lo envía.
// Uso:  node scripts/test-cotizacion.js  [email-opcional]
import { writeFileSync } from 'node:fs';
import { generarCotizacionPDF } from '../src/quote/pdf.js';
import { enviarCotizacionPorEmail } from '../src/quote/index.js';
import { emailConfigurado } from '../src/quote/email.js';
import { closeBrowser } from '../src/scraper/browser.js';

const email = process.argv[2];

const datos = {
  proyecto: 'Parque Quilicura',
  ubicacion: 'Quilicura · Región Metropolitana',
  tipologia: 'Modelo S5 · 3 dormitorios, 2 baños',
  dormitorios: '3',
  banos: '2',
  superficie_m2: '66',
  precio_uf: 3136,
  cliente_nombre: 'Peter Fulle',
  cliente_email: email || 'cliente@ejemplo.cl',
  url: 'https://www.iaconcagua.com/proyectos/parque-quilicura',
};

try {
  console.log('→ Generando PDF de cotización (con UF del día en vivo)…');
  const { buffer, cotizacion } = await generarCotizacionPDF(datos);
  const out = `/tmp/cotizacion-${cotizacion.folio}.pdf`;
  writeFileSync(out, buffer);
  console.log(`✅ PDF generado: ${out} (${(buffer.length / 1024).toFixed(0)} KB)`);
  console.log(
    `   Total: $${Math.round(cotizacion.precio_clp).toLocaleString('es-CL')} CLP  ` +
      `(UF ${cotizacion.precio_uf} × $${cotizacion.valor_uf.toLocaleString('es-CL')} del ${cotizacion.fecha_uf})`
  );

  if (email && emailConfigurado()) {
    console.log(`→ Enviando por email a ${email}…`);
    const r = await enviarCotizacionPorEmail({ ...datos, cliente_email: email });
    console.log(`✅ Email enviado (vía ${r.email.via}, id ${r.email.id})`);
  } else if (email) {
    console.log('⚠️  Email NO configurado (define RESEND_API_KEY o SMTP_* en .env). Solo generé el PDF.');
  }
} catch (e) {
  console.error('❌ Error:', e.message);
} finally {
  await closeBrowser();
  process.exit(0);
}
