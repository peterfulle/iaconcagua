import { withPage, closeBrowser } from '../src/scraper/browser.js';

try {
  await withPage('/proyectos', async (page) => {
    const title = await page.title();
    const url = page.url();
    const bodyLen = await page.evaluate(() => document.body.innerText.length);
    const bodyHead = await page.evaluate(() => document.body.innerText.slice(0, 500));
    const anchors = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href]'))
        .map((a) => a.getAttribute('href'))
        .filter((h) => h && h.includes('proyecto'))
        .slice(0, 40)
    );
    console.log('TITLE:', title);
    console.log('URL:', url);
    console.log('BODY length:', bodyLen);
    console.log('BODY head:\n', bodyHead);
    console.log('\nAnchors con "proyecto":', anchors.length);
    console.log(anchors.join('\n'));
  });
} catch (e) {
  console.error('ERR', e.message);
} finally {
  await closeBrowser();
  process.exit(0);
}
