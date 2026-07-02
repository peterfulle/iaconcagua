// Prueba el cotizador en vivo contra iaconcagua.com (verifica el bypass de Cloudflare).
// Uso:  node scripts/test-scraper.js  [slug-opcional]
import { listarProyectos, verProyecto } from '../src/scraper/iaconcagua.js';
import { closeBrowser } from '../src/scraper/browser.js';

try {
  console.log('→ Leyendo catálogo /proyectos …');
  const proyectos = await listarProyectos();
  console.log(`✅ ${proyectos.length} proyectos detectados:`);
  console.log(proyectos.slice(0, 15).map((p) => `   - ${p.nombre} [${p.slug}]`).join('\n'));

  const slug = process.argv[2] || proyectos[0]?.slug;
  if (slug) {
    console.log(`\n→ Abriendo ficha del proyecto "${slug}" …`);
    const d = await verProyecto(slug);
    console.log('✅ Título:', d.titulo);
    console.log('   Valores UF detectados:', d.valoresUF.join(', ') || '(ninguno)');
    console.log('\n--- Extracto ---\n' + d.texto.slice(0, 800));
  }
} catch (err) {
  console.error('❌ Error:', err.message);
  console.error('   Si es un bloqueo de Cloudflare, prueba con HEADLESS=false en .env');
} finally {
  await closeBrowser();
  process.exit(0);
}
