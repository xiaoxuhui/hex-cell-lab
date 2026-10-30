const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const files=['index.html','styles/main.css','src/core.js','src/app.js','src/expression.js','src/presets.js','src/cycles.js','vendor/jsep-1.4.0/dist/iife/jsep.iife.js','vendor/jsep-1.4.0/LICENSE'];
for(const rel of files){const dest=path.join(root,'dist',rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,rel),dest);}
console.log('Built '+files.length+' static files to dist/');
