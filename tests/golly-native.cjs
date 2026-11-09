// Optional external verification: node tests/golly-native.cjs /absolute/path/to/bgolly
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),a=require('node:assert/strict'),C=require('../src/core.js'),G=require('../src/golly.js'),P=require('../src/presets.js'),R=require('../src/redstone.js');
const {sourceSpec}=require('../src/golly-input.js');
const exe=path.resolve(process.argv[2]||process.env.GOLLY_EXE||'bgolly'),dir=path.join(__dirname,'artifacts/golly-native');fs.mkdirSync(dir,{recursive:true});
const token=v=>v===0?'.':v<=24?String.fromCharCode(64+v):String.fromCharCode(111+Math.floor((v-1)/24),65+(v-1)%24);
(async()=>{const specs=[
 ['life',{format:'bs',text:'B3/S23'}],['sbc-user',{format:'sbc',text:'S23/B2/C2'}],['generations',{format:'sbc',text:'S345/B2/C4'}],['empty-counts',{format:'sbc',text:'S/B/C2'}],['b0-binary',{format:'sbc',text:'S23/B0/C2'}],['b0-generations',{format:'sbc',text:'S23/B02/C3'}],
 ['table-direction',{format:'table',text:'*,火,*,*,0,*,*,*,*,火\n火,*,*,*,*,*,*,*,*,水',labels:'0,火,水',fallback:'keep'}],['table-zero',{format:'table',text:'*,*,*,*,*,*,*,1,*,1',labels:'0,1',fallback:'zero'}],
 ['expression-direction',{format:'expression',text:'(A+2*B+C+D+E+F+G+H+I)%3'},3],['expression-life',{format:'expression',text:'n==3 || (E==1 && n==2)'},2],['wireworld',{format:'expression',text:P.wireworld},4],['table-32',{format:'table',text:'*,*,*,*,*,*,*,*,*,31',labels:Array.from({length:32},(_,i)=>String(i)).join(',')},32]
 ,['redstone',{format:'expression',text:R.formula},R.parts.length]
 ];
 for(const name of ['WireWorld','Circle','HPPMargolus_emulated']){
  const file=path.join(path.dirname(exe),'Rules',name+'.rule');
  if(fs.existsSync(file))specs.push(['stock-'+name,sourceSpec(fs.readFileSync(file,'utf8'))]);
 }
 let passed=0;for(const [id,spec,stateCount]of specs){const rule=C.compile(spec),count=stateCount||rule.count,out=await G.convert(rule,{stateCount:count}),width=12,height=10;
 const imported=C.compile(sourceSpec(out.text));
 if(out.filename)fs.writeFileSync(path.join(dir,out.filename),out.text);
 let seed=15901,grid=Array.from({length:width*height},()=>{seed=(seed*16807)%2147483647;return seed%count;});
 const input=path.join(dir,id+'-input.rle'),nativeRule=out.ruleName+':T'+width+','+height;
 fs.writeFileSync(input,'#CXRLE Pos=-6,-5\nx = '+width+', y = '+height+', rule = '+nativeRule+'\n'+Array.from({length:height},(_,y)=>grid.slice(y*width,(y+1)*width).map(token).join('')).join('$')+'!\n');
 const commands=[];for(let step=0;step<5;step++){commands.push('step 1');for(let y=0;y<height;y++)for(let x=0;x<width;x++)commands.push('get '+(x-width/2)+' '+(y-height/2));}
 const result=cp.spawnSync(exe,['-a',out.algorithm,'-s',dir+path.sep,'--exec','-',input],{input:commands.join('\n')+'\n',encoding:'utf8',timeout:30000,windowsHide:true});
 a.equal(result.status,0,id+' native load/run: '+result.stdout+' '+result.stderr+' '+result.error);
 const actual=[...result.stdout.matchAll(/At (-?\d+),(-?\d+) -> (\d+)/g)].map(m=>Number(m[3]));a.equal(actual.length,5*width*height,id+' complete coordinate reads');
 for(let step=0;step<5;step++){
  const next=C.step(grid,width,height,rule,'wrap');
  a.deepEqual(C.step(grid,width,height,imported,'wrap'),next,id+' imported generation '+(step+1));
  grid=next;
  // QuickLife stores the complemented background on odd B0/not-S8 generations.
  const raw=actual.slice(step*width*height,(step+1)*width*height),decoded=out.algorithm==='QuickLife'&&rule.birth.has(0)&&!rule.survive.has(8)&&step%2===0?raw.map(v=>1-v):raw;
  a.deepEqual(decoded,grid,id+' native generation '+(step+1));
 }console.log('PASS N'+String(++passed).padStart(2,'0')+' '+id+' / '+out.algorithm);
 }console.log('PASS '+passed+' official Golly engine comparisons (5 generations, torus 12×10)');})().catch(e=>{console.error(e);process.exitCode=1;});
