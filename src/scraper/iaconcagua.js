import { withPage } from './browser.js';

// Cache simple en memoria para no reabrir el navegador en cada mensaje.
const cache = new Map();
function getCached(key, ttlMs) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v;
  return null;
}
function setCached(key, v) {
  cache.set(key, { t: Date.now(), v });
}

function limpiarTexto(txt, max = 6000) {
  const clean = String(txt || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return clean.length > max ? clean.slice(0, max) + '\n…[texto recortado]' : clean;
}

/**
 * Lista los proyectos del catálogo (/proyectos). Devuelve [{nombre, slug, url}].
 * Cacheado 15 min.
 */
export async function listarProyectos() {
  const cached = getCached('catalogo', 15 * 60 * 1000);
  if (cached) return cached;

  const proyectos = await withPage('/proyectos', async (page) => {
    // Scroll para gatillar carga diferida (lazy load).
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 800) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(800);

    return page.evaluate(() => {
      const out = {};
      for (const a of Array.from(document.querySelectorAll('a[href]'))) {
        const href = (a.getAttribute('href') || '').trim();
        // Primer segmento tras /proyectos/ (ignora filtros tipo /proyectos?...)
        const m = href.match(/\/proyectos\/([a-z0-9][a-z0-9\-]*)/i);
        if (!m) continue;
        const slug = m[1].toLowerCase();
        if (['proyectos', 'descarga'].includes(slug)) continue;
        const nombre =
          (a.textContent || '')
            .replace(/\s+/g, ' ')
            .replace(/\s*Ver proyecto\s*$/i, '')
            .trim() || slug.replace(/-/g, ' ');
        // Nos quedamos con el nombre más largo/descriptivo por slug.
        if (!out[slug] || nombre.length > out[slug].nombre.length) {
          out[slug] = {
            slug,
            nombre,
            url: `https://www.iaconcagua.com/proyectos/${slug}`,
          };
        }
      }
      return Object.values(out);
    });
  });

  setCached('catalogo', proyectos);
  return proyectos;
}

/**
 * Abre la página de un proyecto y devuelve el texto visible (para que Claude lo lea).
 * Acepta slug ("parque-quilicura") o URL completa. Cacheado 15 min.
 */
export async function verProyecto(slugOrUrl) {
  const ruta = slugOrUrl.startsWith('http')
    ? slugOrUrl
    : `/proyectos/${slugOrUrl.replace(/^\/+|\/+$/g, '')}`;
  const key = `proyecto:${ruta}`;
  const cached = getCached(key, 15 * 60 * 1000);
  if (cached) return cached;

  const data = await withPage(ruta, async (page, url) => {
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 800) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 100));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(600);

    const titulo = await page.title();
    const texto = await page.evaluate(() => {
      const main = document.querySelector('main') || document.body;
      return main.innerText || '';
    });
    return { url, titulo, texto };
  });

  const resultado = {
    url: data.url,
    titulo: data.titulo,
    texto: limpiarTexto(data.texto),
    valoresUF: [...new Set((data.texto.match(/UF\s?[\d.]+/gi) || []))].slice(0, 20),
  };
  setCached(key, resultado);
  return resultado;
}

/**
 * Navegación libre por el sitio (para que el agente explore secciones distintas
 * a /proyectos, por ejemplo artículos o una comuna específica).
 */
export async function navegar(ruta) {
  const data = await withPage(ruta, async (page, url) => {
    const titulo = await page.title();
    const texto = await page.evaluate(
      () => (document.querySelector('main') || document.body).innerText || ''
    );
    return { url, titulo, texto };
  });
  return { url: data.url, titulo: data.titulo, texto: limpiarTexto(data.texto) };
}
