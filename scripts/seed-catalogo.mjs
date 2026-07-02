// Scrapea TODO el catálogo de iaconcagua (vía proxy) y exporta src/catalogo-seed.json
// Uso:  PROXY_URL="http://..." node scripts/seed-catalogo.mjs
process.env.DB_PATH = '/tmp/seed-catalogo.sqlite';
import { refrescarCatalogo, exportarSeed } from '../src/scraper/catalogo-cache.js';
import { proyectosStats } from '../src/crm/db.js';
import { closeBrowser } from '../src/scraper/browser.js';

try {
  await refrescarCatalogo();
  const stats = proyectosStats();
  const n = exportarSeed();
  console.log(`🌱 Seed exportado: ${n} proyectos (${stats.conPrecio} con precio) → src/catalogo-seed.json`);
} catch (e) {
  console.error('ERR', e.message);
} finally {
  await closeBrowser();
  process.exit(0);
}
