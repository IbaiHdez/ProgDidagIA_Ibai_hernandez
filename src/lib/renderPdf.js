import puppeteer from 'puppeteer';
export async function renderPdf(html) {
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true, pipe: true });
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', (req) => { if (/^https?:/i.test(req.url())) req.abort(); else req.continue(); });
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    return await page.pdf({ format: 'A4', printBackground: true, margin: { top: '1.8cm', right: '1.5cm', bottom: '1.8cm', left: '1.5cm' },
      displayHeaderFooter: true, headerTemplate: '<div></div>', footerTemplate: '<div style="width:100%;text-align:center;font:9px Arial;color:#64748b"><span class="pageNumber"></span> / <span class="totalPages"></span></div>' });
  } finally { await browser?.close(); }
}
