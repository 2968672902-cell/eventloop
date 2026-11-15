import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const files={'/':['text/html; charset=utf-8','index.html'],'/index.html':['text/html; charset=utf-8','index.html'],'/style.css':['text/css; charset=utf-8','style.css'],'/app.js':['text/javascript; charset=utf-8','app.js']};
const assets=Object.fromEntries(Object.entries(files).map(([p,[type,file]])=>[p,[type,readFileSync(join(root,'shared',file),'utf8')]]));
const source=readFileSync(join(root,'worker','index.mjs'),'utf8').replace("import { assets } from './assets.mjs';",`const assets = ${JSON.stringify(assets)};`);
mkdirSync(join(root,'dist','server'),{recursive:true});
writeFileSync(join(root,'dist','server','index.js'),source);
