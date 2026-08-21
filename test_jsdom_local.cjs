const express = require('express');
const app = express();
app.use(express.static('dist'));
const server = app.listen(3002, () => {
  const jsdom = require('jsdom');
  const virtualConsole = new jsdom.VirtualConsole();
  virtualConsole.on("jsdomError", e => console.error("JSDOM ERROR:", e.stack || e));
  virtualConsole.on("error", e => console.error("ERR:", e));
  virtualConsole.on("log", e => console.log("LOG:", e));
  virtualConsole.on("warn", e => console.warn("WARN:", e));
  virtualConsole.on("info", e => console.info("INFO:", e));
  
  jsdom.JSDOM.fromURL("http://localhost:3002/", {
    runScripts: "dangerously",
    resources: "usable",
    virtualConsole
  }).then(dom => {
    setTimeout(() => {
      console.log("Root content:", dom.window.document.getElementById('root').innerHTML);
      server.close();
    }, 2000);
  });
});
