const html = '<script type="module" crossorigin src="/assets/index-m5BcvU5A.js"></script><link rel="stylesheet" crossorigin href="/assets/index-DcHelkYL.css">';
const scriptMatches = html.matchAll(/src=["'](\/assets\/[^"']+)["']/g);
const assetUrls = new Set();
for (const match of scriptMatches) {
  assetUrls.add(match[1]);
}
const cssMatches = html.matchAll(/href=["'](\/assets\/[^"']+)["']/g);
for (const match of cssMatches) {
  assetUrls.add(match[1]);
}
console.log(Array.from(assetUrls));
