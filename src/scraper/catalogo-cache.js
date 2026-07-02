import { listarProyectos, verProyecto } from './iaconcagua.js';
import { upsertProyecto, proyectosStats } from '../crm/db.js';

let refrescando = false;

function parsePrecioDesde(texto) {
  // "Unidades disponibles a partir de: 3.136 UF"
  const m = String(texto || '').match(/a partir de:?\s*([\d.]+)\s*UF/i);
  if (m) return Number(m[1].replace(/\./g, ''));
  // fallback: primer "UF X" del texto
  const m2 = String(texto || '').match(/UF\s?([\d.]+)/i);
  return m2 ? Number(m2[1].replace(/\./g, '')) : null;
}

/**
 * Refresca el caché: lee el catálogo y la ficha de cada proyecto (vía proxy),
 * y guarda todo en la base de datos. Corre en segundo plano.
 */
export async function refrescarCatalogo({ log = console.log } = {}) {
  if (refrescando) {
    log('Refresco ya en curso, omito.');
    return proyectosStats();
  }
  refrescando = true;
  const t0 = Date.now();
  try {
    log('🔄 Refrescando catálogo de iaconcagua…');
    const proyectos = await listarProyectos();
    log(`   ${proyectos.length} proyectos en el catálogo. Leyendo fichas…`);
    let ok = 0;
    for (const p of proyectos) {
      try {
        const d = await verProyecto(p.slug);
        const precio = parsePrecioDesde(d.texto);
        upsertProyecto({
          slug: p.slug,
          nombre: p.nombre,
          catalogo: p.nombre,
          url: p.url,
          precio_uf_desde: precio,
          detalle: d.texto,
        });
        ok++;
      } catch (e) {
        log(`   ⚠️ ${p.slug}: ${e.message}`);
      }
    }
    const stats = proyectosStats();
    log(`✅ Caché actualizado: ${ok}/${proyectos.length} fichas en ${((Date.now() - t0) / 1000).toFixed(0)}s. Total en DB: ${stats.total} (${stats.conPrecio} con precio).`);
    return stats;
  } catch (e) {
    log(`❌ Error refrescando catálogo: ${e.message}`);
    return proyectosStats();
  } finally {
    refrescando = false;
  }
}

/** Programa el refresco: al inicio (si está vacío/viejo) y luego cada `horas`. */
export function programarRefresco(horas = 6) {
  const stats = proyectosStats();
  const vacioOViejo =
    stats.total === 0 ||
    !stats.ultima ||
    Date.now() - new Date(stats.ultima.replace(' ', 'T')).getTime() > horas * 3600 * 1000;
  if (vacioOViejo) {
    setTimeout(() => refrescarCatalogo().catch(() => {}), 5000); // arranca a los 5s
  }
  setInterval(() => refrescarCatalogo().catch(() => {}), horas * 3600 * 1000);
}
