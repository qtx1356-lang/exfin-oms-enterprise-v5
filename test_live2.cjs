const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('LIVE LOG:', msg.text()));
  page.on('pageerror', error => console.log('LIVE ERROR:', error.message));
  
  await page.goto('https://exfin-oms-enterprise-v5.pages.dev/', { waitUntil: 'load' });
  
  setTimeout(async () => {
    const rootHtml = await page.evaluate(() => document.getElementById('root')?.innerHTML || 'ROOT_NOT_FOUND');
    console.log('Live Root HTML length:', rootHtml.length);
    await browser.close();
    process.exit(0);
  }, 2000);
})();
