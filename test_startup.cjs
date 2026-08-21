const puppeteer = require('puppeteer');
const express = require('express');
const app = express();

app.use(express.static('dist'));
app.get('*', (req, res) => res.sendFile(__dirname + '/dist/index.html'));

const server = app.listen(3002, async () => {
  console.log('Server started on 3002');
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure().errorText));
  
  await page.goto('http://localhost:3002/', { waitUntil: 'networkidle0' });
  await browser.close();
  server.close();
});
