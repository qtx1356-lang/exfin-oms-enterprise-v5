const { chromium } = require('playwright');
const express = require('express');
const app = express();
app.use(express.static('dist'));
const server = app.listen(3002, async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.addInitScript(() => {
    window.median = {
      isNativeApp: () => true,
      backgroundLocation: {
        start: null, stop: null
      }
    };
  });
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure().errorText));
  
  await page.goto('http://localhost:3002/');
  
  setTimeout(async () => {
    const rootHtml = await page.evaluate(() => document.getElementById('root').innerHTML);
    console.log('Root HTML length:', rootHtml.length);
    await browser.close();
    server.close();
  }, 3000);
});
