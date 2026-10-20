/* Canvas rendering and UI; all evolution and validation live in core.js. */
(function(){
  'use strict';
  const C=window.CellCore,$=id=>document.getElementById(id),canvas=$('board'),ctx=canvas.getContext('2d');
  const KEY='cell-lab-v1',colors=['#1a2d22','#c3e98e','#e9b966','#82b9ae','#ca93c1','#91a6db','#e18c78','#e4d983'];
  const drafts={bs:'B3/S23',sbc:'S23/B2/C2',table:'1,0,1,0,1,0,1,*,1,1'};
  let format='bs',rule=C.compile({format,text:drafts.bs}),width=72,height=48,grid=Array(width*height).fill(0),generation=0,boundary='wrap';
  let running=false,timer=null,brush=1,erasing=false,zoom=1,showGrid=true,view={},drawing=false,lastCell=null,strokeValue=1,history=[],saveTimer=null,dirty=false;
  const color=i=>colors[i]||`hsl(${(i*47+50)%360} 48% 68%)`;
  function spec(){return {format,text:$('rule-text').value,labels:$('state-labels').value,fallback:$('fallback').value};}
  function snapshot(){return {version:1,width,height,grid:[...grid],generation,boundary,rule:{format:rule.format,text:rule.text,labels:rule.labels,fallback:rule.fallback}};}
  function pushHistory(){history.push(snapshot());if(history.length>30)history.shift();$('undo').disabled=false;}
  function saveSoon(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{localStorage.setItem(KEY,JSON.stringify(snapshot()));$('save-status').textContent='已自动保存在此浏览器';}catch{$('save-status').textContent='自动保存不可用，请导出备份';}},250);}
  function notice(text){$('apply-note').textContent=text;}
  function updateStats(){const n=grid.reduce((a,b)=>a+(b!==0),0);$('generation').textContent=generation.toLocaleString();$('population').textContent=n.toLocaleString();$('density').textContent=(100*n/grid.length).toFixed(1)+'%';$('active-rule').textContent=rule.format==='table'?rule.rules.length+' 条规则':rule.text.toUpperCase().replace(/\s/g,'');$('rule-kind').textContent=(rule.format==='table'?'自定义':rule.format==='bs'?'B/S':'SBC')+' · '+rule.count+' 状态';$('board-size').textContent=width+' × '+height;}
  function palette(){const p=$('palette');p.replaceChildren();for(let i=0;i<rule.count;i++){const b=document.createElement('button');b.className='swatch';b.style.setProperty('--swatch',color(i));b.textContent=rule.labels[i];b.title='绘制状态 '+rule.labels[i];b.setAttribute('aria-label','绘制状态 '+rule.labels[i]);b.setAttribute('aria-pressed',String(!erasing&&i===brush));b.onclick=()=>{brush=i;erasing=false;palette();};p.append(b);}$('eraser').setAttribute('aria-pressed',String(erasing));}
  function draw(){const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return;const dpr=Math.min(window.devicePixelRatio||1,3),w=Math.round(r.width*dpr),h=Math.round(r.height*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#17281f';ctx.fillRect(0,0,r.width,r.height);
    const size=Math.min((r.width-28)/width,(r.height-48)/height)*zoom,ox=(r.width-size*width)/2,oy=(r.height-size*height)/2;view={size,ox,oy};
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){const value=grid[y*width+x],px=ox+x*size,py=oy+y*size;if(px+size<0||py+size<0||px>r.width||py>r.height)continue;if(value){ctx.fillStyle=color(value);ctx.fillRect(px+.6,py+.6,Math.max(.5,size-1.2),Math.max(.5,size-1.2));}else if(showGrid&&size>=4){ctx.fillStyle='#344c3440';ctx.fillRect(px+size/2-.5,py+size/2-.5,1,1);}}
    if(showGrid&&size>=11){ctx.strokeStyle='#43634435';ctx.lineWidth=.5;ctx.beginPath();for(let x=0;x<=width;x++){ctx.moveTo(ox+x*size,oy);ctx.lineTo(ox+x*size,oy+height*size);}for(let y=0;y<=height;y++){ctx.moveTo(ox,oy+y*size);ctx.lineTo(ox+width*size,oy+y*size);}ctx.stroke();}
  }
  function refresh(){updateStats();draw();saveSoon();}
  function setRunning(value){if(value===running)return;running=value;clearTimeout(timer);if(value){pushHistory();tick();}$('play').querySelector('span').textContent=value?'暂停演化':'开始演化';$('play').firstChild.textContent=value?'Ⅱ ':'▶ ';$('run-status').textContent=value?'正在生长':'等待生长';$('status-dot').classList.toggle('running',value);$('step').disabled=value;}
  function tick(){if(!running)return;grid=C.step(grid,width,height,rule,boundary);generation++;refresh();timer=setTimeout(tick,1000/Number($('speed').value));}
  function setFormat(next,remember=true){if(remember)drafts[format]=$('rule-text').value;format=next;$('rule-text').value=drafts[next];document.querySelectorAll('[data-format]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.format===next)));$('custom-options').hidden=next!=='table';$('expand').hidden=next!=='table';$('rule-text').rows=next==='table'?5:3;
    $('rule-description').textContent=next==='bs'?'B 指出生，S 指存活。B3/S23：有 3 个活邻居时出生，有 2 或 3 个活邻居时存活。':next==='sbc'?'S 指存活，B 指出生，C 指状态总数。仅状态 1 计入活邻居；失活后依次经过 2…C−1，再回到 0。C2 只有空白与活跃两种状态。':'每行 10 项，用逗号分隔；多条规则用换行或 / 分隔。* 匹配任意状态，结果不能是 *。从上到下，第一条匹配的规则生效。';
    $('order-help').textContent=next==='table'?'中心,上,右上,右,右下,下,左下,左,左上,结果':'按顺时针读取邻居，所有元胞同时更新。';markDirty();}
  function markDirty(){dirty=true;$('draft-status').textContent='尚未应用';$('rule-error').hidden=true;}
  function applied(){dirty=false;$('draft-status').textContent='已应用';$('rule-error').hidden=true;}
  function applyRule(){try{const next=C.compile(spec());setRunning(false);pushHistory();const oldLabels=rule.labels;let changed=0;grid=grid.map(v=>{const n=next.labels.indexOf(oldLabels[v]);if(n<0){changed++;return 0;}return n;});rule=next;brush=Math.min(brush,rule.count-1);drafts[format]=$('rule-text').value;applied();palette();refresh();notice('已应用'+(changed?'；'+changed+' 个未定义状态已归零。':'，下一代将使用这套规则。'));return true;}catch(e){$('rule-error').textContent=e.message;$('rule-error').hidden=false;return false;}}
  function restore(raw,retainHistory=false){const s=C.validateSave(raw);setRunning(false);if(!retainHistory)history=[];width=s.width;height=s.height;grid=s.grid;generation=s.generation;boundary=s.boundary;rule=C.compile(s.rule);drafts[rule.format]=rule.text;$('state-labels').value=rule.labels.join(',');$('fallback').value=rule.fallback||'keep';setFormat(rule.format,false);$('boundary').value=boundary;brush=Math.min(brush,rule.count-1);applied();palette();$('undo').disabled=!history.length;refresh();}
  function locate(e){const r=canvas.getBoundingClientRect();return {x:Math.floor((e.clientX-r.left-view.ox)/view.size),y:Math.floor((e.clientY-r.top-view.oy)/view.size)};}
  function paintCell(x,y){if(x>=0&&x<width&&y>=0&&y<height)grid[y*width+x]=strokeValue;}
  function paintTo(point){if(lastCell){let {x,y}=lastCell,dx=Math.abs(point.x-x),dy=-Math.abs(point.y-y),sx=x<point.x?1:-1,sy=y<point.y?1:-1,err=dx+dy;for(let n=0;n<1000;n++){paintCell(x,y);if(x===point.x&&y===point.y)break;const e=2*err;if(e>=dy){err+=dy;x+=sx;}if(e<=dx){err+=dx;y+=sy;}}}else paintCell(point.x,point.y);lastCell=point;refresh();}
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0&&e.button!==2)return;const p=locate(e);if(p.x<0||p.y<0||p.x>=width||p.y>=height)return;e.preventDefault();setRunning(false);pushHistory();drawing=true;lastCell=null;strokeValue=e.button===2||erasing?0:brush;canvas.setPointerCapture(e.pointerId);paintTo(p);});
  canvas.addEventListener('pointermove',e=>{const p=locate(e);$('coordinate').textContent=p.x>=0&&p.x<width&&p.y>=0&&p.y<height?'x '+p.x+' · y '+p.y:'x — · y —';if(drawing)paintTo(p);});
  const endStroke=()=>{drawing=false;lastCell=null;};canvas.addEventListener('pointerup',endStroke);canvas.addEventListener('pointercancel',endStroke);canvas.addEventListener('lostpointercapture',endStroke);canvas.addEventListener('contextmenu',e=>e.preventDefault());
  $('play').onclick=()=>setRunning(!running);$('step').onclick=()=>{pushHistory();grid=C.step(grid,width,height,rule,boundary);generation++;refresh();};
  $('undo').onclick=()=>{if(history.length)restore(history.pop(),true);};
  $('speed').oninput=()=>{$('speed-value').textContent=$('speed').value+' 代/秒';};
  $('random').onclick=()=>{setRunning(false);pushHistory();grid=grid.map(()=>Math.random()<.24?1:0);generation=0;refresh();notice('已随机播种，点击开始演化。');};
  $('clear').onclick=()=>{setRunning(false);pushHistory();grid.fill(0);generation=0;refresh();notice('棋盘已清空，可以重新绘制。');};
  $('eraser').onclick=()=>{erasing=!erasing;palette();};$('apply').onclick=applyRule;
  document.querySelectorAll('[data-format]').forEach(b=>b.onclick=()=>setFormat(b.dataset.format));
  ['rule-text','state-labels','fallback'].forEach(id=>$(id).addEventListener('input',markDirty));
  $('preset').onchange=()=>{const presets={life:['bs','B3/S23'],seeds:['bs','B2/S'],brain:['sbc','S/B2/C3'],'user-sbc':['sbc','S23/B2/C2'],'user-table':['table','1,0,1,0,1,0,1,*,1,1'],signal:['table','0,火,*,*,*,*,*,*,*,火\n火,*,*,*,*,*,*,*,*,水\n水,*,*,*,*,*,*,*,*,0']};const [f,t]=presets[$('preset').value];setFormat(f);$('rule-text').value=t;if(f==='table')$('state-labels').value=$('preset').value==='signal'?'0,火,水':'0,1';markDirty();notice('已载入示例，点击“应用规则”后生效。');};
  $('boundary').onchange=()=>{setRunning(false);pushHistory();boundary=$('boundary').value;saveSoon();};
  const setZoom=z=>{zoom=Math.max(.6,Math.min(4,z));$('zoom-value').textContent=Math.round(zoom*100)+'%';draw();};$('zoom-in').onclick=()=>setZoom(zoom*1.25);$('zoom-out').onclick=()=>setZoom(zoom/1.25);$('fit').onclick=()=>setZoom(1);$('grid-toggle').onclick=()=>{showGrid=!showGrid;$('grid-toggle').setAttribute('aria-pressed',String(showGrid));draw();};
  $('expand').onclick=()=>{try{const r=C.compile(spec()),e=C.expansion(r);$('expansion-info').textContent='共 '+e.total.toLocaleString()+' 条，展示前 '+e.lines.length+' 条（保持原有优先顺序）。';$('expansion-lines').textContent=e.lines.join('\n');$('expansion-dialog').showModal();}catch(e){$('rule-error').textContent=e.message;$('rule-error').hidden=false;}};$('close-dialog').onclick=()=>$('expansion-dialog').close();
  $('export').onclick=()=>{const blob=new Blob([JSON.stringify(snapshot(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='cell-lab-generation-'+generation+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice('已导出当前棋盘与已应用规则'+(dirty?'；未应用的草稿未导出。':'。'));};
  $('import').onclick=()=>$('file').click();$('file').onchange=async()=>{const f=$('file').files[0];if(!f)return;try{if(f.size>2000000)throw Error('文件大小不能超过 2 MB');const s=C.validateSave(JSON.parse(await f.text()));pushHistory();restore(s,true);notice('存档已导入。');}catch(e){$('rule-error').textContent='导入失败：'+e.message;$('rule-error').hidden=false;}$('file').value='';};
  document.addEventListener('keydown',e=>{if(e.code==='Space'&&!e.repeat&&!/INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName)&&!$('expansion-dialog').open){e.preventDefault();setRunning(!running);}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)setRunning(false);});window.addEventListener('pagehide',()=>{try{localStorage.setItem(KEY,JSON.stringify(snapshot()));}catch{/* Existing save status already exposes storage availability. */}});
  new ResizeObserver(draw).observe($('canvas-wrap'));
  // A deterministic seed keeps the first visit interesting and reproducible.
  for(const [dx,dy] of [[1,0],[2,1],[0,2],[1,2],[2,2],[-12,-4],[-11,-4],[-10,-4],[-10,-5],[-11,-6],[12,5],[13,5],[12,6],[13,6]])grid[(24+dy)*width+36+dx]=1;
  try{const raw=localStorage.getItem(KEY);if(raw)restore(JSON.parse(raw));else{palette();refresh();}}catch{palette();refresh();notice('本地存档无效，已载入初始种子。');}
  // Read-only state and coordinate access make browser acceptance checks reliable.
  window.CellLab={getState:()=>snapshot(),getView:()=>({...view,running,brush,zoom}),getDraft:()=>spec()};
})();
