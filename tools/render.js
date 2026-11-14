// Rendert SVG-Dateien mit Chromium zu PNG. Wird von build_logo.py aufgerufen.
const fs = require('fs');
const { chromium } = require('playwright');
(async () => {
  const jobs = JSON.parse(process.argv[2]);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const j of jobs) {
    await page.setViewportSize({ width: j.px, height: j.px });
    await page.setContent('<html><body style="margin:0">' + fs.readFileSync(j.src, 'utf8') + '</body></html>');
    await page.screenshot({ path: j.out, omitBackground: true });
    console.log('geschrieben:', j.out.split('/').pop());
  }
  await browser.close();
})();
