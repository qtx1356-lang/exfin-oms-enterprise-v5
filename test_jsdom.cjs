const { JSDOM } = require('jsdom');
const fs = require('fs');

const html = fs.readFileSync('dist/index.html', 'utf8');

const dom = new JSDOM(html, {
  url: "https://exfin-oms-enterprise-v5.pages.dev/",
  runScripts: "dangerously",
  resources: "usable",
});

dom.window.console.log = function() { console.log("JSDOM LOG:", ...arguments); };
dom.window.console.warn = function() { console.warn("JSDOM WARN:", ...arguments); };
dom.window.console.error = function() { console.error("JSDOM ERROR:", ...arguments); };
dom.window.addEventListener("error", (event) => {
  console.error("JSDOM UNCAUGHT ERROR:", event.error.message, event.error.stack);
});
dom.window.addEventListener("unhandledrejection", (event) => {
  console.error("JSDOM UNHANDLED REJECTION:", event.reason);
});

setTimeout(() => {
  console.log("Checking if #root is empty:", dom.window.document.getElementById('root').innerHTML);
}, 2000);
