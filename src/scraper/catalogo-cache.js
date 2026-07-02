import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listarProyectos, verProyecto } from './iaconcagua.js';
import { upsertProyecto, proyectosStats, dumpProyectos } from '../crm/db.js';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_PATH = path.join(__dirname, '..', 'catalogo-seed.json');

let refrescando = false;

/** Exporta el caché actual a un archivo JSON (para usarlo como seed). */
export function exportarSeed(file = SEED_PATH) {
  const rows = dumpProyectos();
  writeFileSync(file, JSON.stringify(rows, null, 0));
  return rows.length;
}

/** Carga el catálogo desde el seed JSON si el caché no tiene buenos precios. */
export function cargarSeedSiVacio(file = SEED_PATH) {
  try {
    // Carga si está vacío o si tiene pocos precios (ej: refresco bloqueado dejó nulls).
    if (proyectosStats().conPrecio >= 30) return 0;
    const rows = JSON.parse(readFileSync(file, 'utf8'));
    for (const r of rows) upsertProyecto(r);
    console.log(`🌱 Catálogo cargado desde seed: ${rows.length} proyectos.`);
    return rows.length;
  } catch (e) {
    return 0;
  }
}

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
        // Solo actualiza si obtuvimos un precio real (evita borrar el seed con nulls
        // cuando Cloudflare bloquea la ficha en la nube).
        if (precio != null) {
          upsertProyecto({
            slug: p.slug,
            nombre: p.nombre,
            catalogo: p.nombre,
            url: p.url,
            precio_uf_desde: precio,
            detalle: d.texto,
          });
          ok++;
        }
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
  cargarSeedSiVacio(); // carga instantánea desde el seed committeado
  if (config.disableRefresh) {
    console.log('📴 Refresco automático del catálogo desactivado (usando seed).');
    return;
  }
  const stats = proyectosStats();
  const vacioOViejo =
    stats.total === 0 ||
    !stats.ultima ||
    Date.now() - new Date(stats.ultima.replace(' ', 'T')).getTime() > horas * 3600 * 1000;
  if (vacioOViejo) {
    setTimeout(() => refrescarCatalogo().catch(() => {}), 5000);
  }
  setInterval(() => refrescarCatalogo().catch(() => {}), horas * 3600 * 1000);
}
