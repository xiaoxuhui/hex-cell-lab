const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
for(const rel of ['index.html','styles/main.css','src/core.js','src/app.js']){const dest=path.join(root,'dist',rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,rel),dest);}
console.log('Built 4 static files to dist/');
