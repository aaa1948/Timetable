// Keep branch-based Pages (main / root) usable as well as Actions deployment.
import { readFileSync, writeFileSync } from 'node:fs';
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8')
  .replace('href="./style.css"', 'href="./public/style.css"')
  .replace('src="./app.js"', 'src="./public/app.js"');
writeFileSync(new URL('../index.html', import.meta.url), html);
