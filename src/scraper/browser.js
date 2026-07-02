import { config } from '../config.js';

const USER_DATA_DIR = config.browserDataDir;

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

let _context = null;
let _startingPromise = null;

/**
 * Devuelve un objeto "chromium" con stealth si está disponible; si no, el de Playwright.
 * playwright-extra + stealth mejora mucho las probabilidades de pasar Cloudflare.
 */
async function getChromium() {
  try {
    const { chromium } = await import('playwright-extra');
    const StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default;
    chromium.use(StealthPlugin());
    return chromium;
  } catch {
    const { chromium } = await import('playwright');
    return chromium;
  }
}

function parseProxy() {
  if (!config.proxyUrl) return undefined;
  try {
    const u = new URL(config.proxyUrl);
    return {
      server: `${u.protocol}//${u.host}`,
      username: decodeURIComponent(u.username || ''),
      password: decodeURIComponent(u.password || ''),
    };
  } catch {
    return undefined;
  }
}

async function launch() {
  const chromium = await getChromium();
  const proxy = parseProxy();
  if (proxy) console.log('🌐 Scraper usando proxy residencial');
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: config.headless,
    userAgent: UA,
    viewport: { width: 1366, height: 900 },
    locale: 'es-CL',
    timezoneId: 'America/Santiago',
    proxy,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--lang=es-CL',
    ],
  });
  context.on('close', () => {
    _context = null;
  });
  return context;
}

async function getContext() {
  if (_context) return _context;
  if (!_startingPromise) {
    _startingPromise = launch()
      .then((ctx) => {
        _context = ctx;
        return ctx;
      })
      .finally(() => {
        _startingPromise = null;
      });
  }
  return _startingPromise;
}

/** ¿La página sigue en el challenge de Cloudflare? */
async function isChallenge(page) {
  try {
    const title = (await page.title()).toLowerCase();
    if (title.includes('just a moment') || title.includes('un momento')) return true;
    const body = (await page.evaluate(() => document.body?.innerText || '')).toLowerCase();
    return (
      body.includes('verifying you are human') ||
      body.includes('verificando que eres') ||
      body.includes('checking your browser') ||
      body.includes('needs to review the security')
    );
  } catch {
    return false;
  }
}

/** Espera a que Cloudflare libere la página (best effort). */
async function waitForCloudflare(page, timeoutMs = 35000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await isChallenge(page))) return true;
    await page.waitForTimeout(1500);
  }
  return !(await isChallenge(page));
}

/**
 * Abre una URL (o ruta relativa a iaconcagua.com), ejecuta `fn(page)` y cierra la pestaña.
 */
export async function withPage(urlOrPath, fn) {
  const url = urlOrPath.startsWith('http')
    ? urlOrPath
    : `${config.site.base}${urlOrPath.startsWith('/') ? '' : '/'}${urlOrPath}`;

  const context = await getContext();
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitForCloudflare(page);
    // Deja que termine de hidratar el contenido dinámico.
    await page.waitForTimeout(1200);
    try {
      await page.waitForLoadState('networkidle', { timeout: 8000 });
    } catch {
      /* ok si no llega a idle */
    }
    return await fn(page, url);
  } finally {
    await page.close().catch(() => {});
  }
}

/** Renderiza HTML a PDF (Buffer) usando Chromium headless. */
export async function htmlToPdf(html) {
  const context = await getContext();
  const page = await context.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle' });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', bottom: '16mm', left: '13mm', right: '13mm' },
    });
  } finally {
    await page.close().catch(() => {});
  }
}

export async function closeBrowser() {
  if (_context) {
    await _context.close().catch(() => {});
    _context = null;
  }
}
