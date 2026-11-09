/* Canvas rendering and UI; all evolution and validation live in core.js. */
(function(){
  'use strict';
  const C=window.CellCore,P=window.CellPresets,$=id=>document.getElementById(id),canvas=$('board'),ctx=canvas.getContext('2d');
  const R=window.CellRedstone,GollyInput=window.CellGollyInput;
  const W=window.CellWorld,Pattern=window.CellPattern;
  const KEY='cell-lab-v1',colors=['#1a2d22','#c3e98e','#e9b966','#82b9ae','#ca93c1','#91a6db','#e18c78','#e4d983'];
  const drafts={bs:'B3/S23',sbc:'S23/B2/C2',table:'1,0,1,0,1,0,1,*,1,1',expression:'n == 3 || (E == 1 && n == 2)',golly:''};
  const presets={life:['bs','B3/S23'],seeds:['bs','B2/S'],brain:['sbc','S/B2/C3'],'user-sbc':['sbc','S23/B2/C2'],'user-table':['table','1,0,1,0,1,0,1,*,1,1'],signal:['table','0,火,*,*,*,*,*,*,*,火\n火,*,*,*,*,*,*,*,*,水\n水,*,*,*,*,*,*,*,*,0'],'expression-life':['expression','n == 3 || (E == 1 && n == 2)'],'expression-cycle':['expression','(E + B + H) % 3'],'expression-random':['expression','random([0, 1, 2, 3])'],wireworld:['expression',P.wireworld]};
  presets.redstone=['expression',R.formula];
  let format='bs',rule=C.compile({format,text:drafts.bs}),width=72,height=48,grid=Array(width*height).fill(0),generation=0,boundary='wrap';
  let running=false,timer=null,brush=1,erasing=false,inspecting=false,zoom=1,showGrid=true,view={},drawing=false,lastCell=null,hoveredCell=null,strokeValue=1,history=[],saveTimer=null,dirty=false;
  let panX=0,panY=0,panning=null,gesturePointer=null,dragView=false;
  let sparse=null,originX=0,originY=0,sparseTile=18;
  const finiteCycle=new window.CellCycles.Tracker({advance:state=>C.step(state,width,height,rule,boundary)});
  const infiniteCycle=new window.CellCycles.Tracker({variableLength:true});
  let cycle=finiteCycle;
  function resetCycle(){
    const tracker=sparse?infiniteCycle:finiteCycle;
    if(tracker!==cycle)cycle.reset([],generation,false);
    cycle=tracker;
    cycle.reset(sparse?sparse.signature():grid,generation,rule.deterministic);
  }
  function updateCycle(){const found=cycle.period!==null;$('cycle-length').textContent=!cycle.enabled?'暂不检测':found?cycle.period.toLocaleString()+' 代':'检测中';$('cycle-status').classList.toggle('detected',found);$('cycle-detail').textContent=!cycle.enabled?'含随机选择的规则，重复局面不能确定循环。':found?(cycle.period===1?'棋盘已稳定，每一代保持相同。':'整张棋盘重复，演化继续。'):'完整棋盘重复后显示；较长循环可能延后确认。';}
  const color=value=>{if(P.isWireworld(rule)&&P.colors[value])return P.colors[value];if(Number.isInteger(value)&&value>=0&&value<colors.length)return colors[value];let hash=0;for(const ch of String(value))hash=(hash*31+ch.charCodeAt(0))|0;return `hsl(${Math.abs(hash)%360} 48% 68%)`;};
  const label=value=>P.isWireworld(rule)&&P.names[value]?value+' · '+P.names[value]:rule.format==='expression'?String(value):rule.labels[value];
  function numberedLabel(value){
    const name=rule.labels[value];
    return name===String(value)?name:`${value} · ${name}`;
  }
  function syncPreset(){const match=Object.entries(presets).find(([,v])=>v[0]===rule.format&&v[1]===rule.text);$('preset').value=match?match[0]:'';}
  function syncDemo(){
    const draft={format,text:$('rule-text').value.trim()};
    $('wireworld-card').hidden=!P.isWireworld(draft);
    $('redstone-card').hidden=!R.isPreset(draft);
  }
  function ruleError(message){$('rule-error').textContent=message;$('rule-error').hidden=false;}
  function redstoneBrushes(){
    const direction=Number($('redstone-direction').value),delay=Number($('redstone-delay').value);
    return [0,R.dust,R.block,R.torch(direction),R.repeater(direction,delay)];
  }
  function validateBrush(){
    if(R.isPreset(rule))brush=redstoneBrushes().find(value=>R.parts[value].kind===R.parts[brush]?.kind)??R.dust;
    else if(rule.format!=='expression'&&(!Number.isInteger(brush)||brush<0||brush>=rule.count))brush=1;
    $('numeric-brush').value=String(brush);
  }
  function spec(){return {format,text:$('rule-text').value,labels:$('state-labels').value,fallback:$('fallback').value};}
  function snapshot(){
    const common={width,height,generation,boundary,rule:C.ruleSpec(rule)};
    return sparse?{version:2,world:'infinite',...common,...W.encodeBoard(sparse),focus:viewportFocus()}
      :{version:1,...common,grid:[...grid]};
  }
  function pushHistory(){
    history.push(snapshot());
    let records=history.reduce((total,save)=>total+(save.cells?.length??0),0);
    while(history.length>30||records>300000)records-=history.shift().cells?.length??0;
    $('undo').disabled=false;
  }
  function saveSoon(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{localStorage.setItem(KEY,JSON.stringify(snapshot()));$('save-status').textContent='已自动保存在此浏览器';}catch{$('save-status').textContent='自动保存不可用，请导出备份';}},250);}
  function notice(text){$('apply-note').textContent=text;}
  function worldMessage(text){$('world-message').textContent=text;}
  function updateStats(){
    const n=sparse?sparse.size:grid.reduce((a,b)=>a+(b!==0),0);
    $('generation').textContent=generation.toLocaleString();
    $('population').textContent=sparse&&sparse.background!==0?'∞':n.toLocaleString();
    $('density').textContent=sparse?'—':(100*n/grid.length).toFixed(1)+'%';
    if(rule.format==='golly'){
      $('active-rule').textContent=rule.name;$('active-rule').title=rule.name;
      $('rule-kind').textContent=`Golly · ${rule.count} 状态`;
    }else{
      $('active-rule').textContent=R.isPreset(rule)?'红石电路':P.isWireworld(rule)?'电线世界':rule.format==='expression'?'表达式':rule.format==='table'?rule.rules.length+' 条规则':rule.text.toUpperCase().replace(/\s/g,'');
      $('active-rule').title=rule.text;
      $('rule-kind').textContent=R.isPreset(rule)?'表达式 · 四方向':P.isWireworld(rule)?'表达式 · 4 状态':rule.format==='expression'?'布尔 / 数值':(rule.format==='table'?'自定义':rule.format==='bs'?'B/S':'SBC')+' · '+rule.count+' 状态';
    }
    $('board-size').textContent=sparse?'无限 ▾':width+' × '+height+' ▾';
    $('board-size').setAttribute('aria-label',sparse?'设置棋盘尺寸，当前无限':'设置棋盘尺寸，当前 '+width+' × '+height);
    $('infinite-toggle').textContent=sparse?'切回有限棋盘':'切换到无限棋盘';
    $('boundary').hidden=Boolean(sparse);
    $('boundary-description').textContent=sparse?'无限棋盘向四面延伸。':'让边缘相遇，或让世界有尽头。';
    $('random').title=sparse?'随机填充视野中央的有限区域':'随机填充棋盘';
  }
  function palette(){
    const p=$('palette'),redstone=R.isPreset(rule),numeric=rule.format==='expression'&&!redstone,golly=rule.format==='golly';
    p.replaceChildren();p.classList.toggle('redstone-palette',redstone);
    const values=redstone?redstoneBrushes():numeric?[...new Set([0,1,2,3,brush])]:Array.from({length:rule.count},(_,i)=>i);
    if(golly){
      const select=document.createElement('select');
      select.className='golly-brush';select.setAttribute('aria-label','选择 Golly 绘制状态');
      for(const value of values)select.add(new Option(numberedLabel(value),value));
      select.value=String(brush);
      select.onchange=()=>{
        brush=Number(select.value);erasing=false;inspecting=false;
        $('eraser').setAttribute('aria-pressed','false');$('inspect').setAttribute('aria-pressed','false');
      };
      p.append(select);
    }else for(const value of values){
      const b=document.createElement('button'),part=redstone?R.parts[value]:null;
      b.className='swatch';b.style.setProperty('--swatch',part?part.color:color(value));
      b.textContent=part?part.name:label(value);
      b.title='绘制状态 '+b.textContent;b.setAttribute('aria-label',b.title);
      b.setAttribute('aria-pressed',String(!inspecting&&!erasing&&value===brush));
      b.onclick=()=>{brush=value;erasing=false;inspecting=false;$('numeric-brush').value=String(value);palette();};p.append(b);
    }
    $('eraser').setAttribute('aria-pressed',String(erasing));$('inspect').setAttribute('aria-pressed',String(inspecting));
    $('numeric-tools').hidden=!numeric;$('redstone-tools').hidden=!redstone;
  }
  function drawRedstoneMark(part,x,y,size){
    const mark=part.kind==='block'?'◆':R.directions[part.direction];
    if(!mark||size<9)return;
    ctx.fillStyle=part.kind==='torch'&&part.strength===0?'#fff0e7':'#21181a';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font=`bold ${Math.min(24,size*.78)}px system-ui`;
    ctx.fillText(mark,x+size/2,y+size/2);
  }
  function drawInfinite(r){
    const {size,ox,oy}=view;
    const redstone=R.isPreset(rule),background=sparse.background;
    const cellColor=value=>value===0?'#17281f':(redstone?R.parts[value]?.color:null)??color(value);
    if(background!==0){ctx.fillStyle=cellColor(background);ctx.fillRect(0,0,r.width,r.height);}
    if(showGrid&&size>=6){
      ctx.strokeStyle=background===0?'#43634452':'#17281f55';ctx.lineWidth=.6;ctx.beginPath();
      for(let x=((ox%size)+size)%size;x<=r.width;x+=size){ctx.moveTo(x,0);ctx.lineTo(x,r.height);}
      for(let y=((oy%size)+size)%size;y<=r.height;y+=size){ctx.moveTo(0,y);ctx.lineTo(r.width,y);}
      ctx.stroke();
    }
    for(const [x,y,value] of sparse.entries()){
      const px=ox+(x-originX)*size,py=oy+(y-originY)*size;
      if(px+size<0||py+size<0||px>r.width||py>r.height)continue;
      ctx.fillStyle=cellColor(value);
      const inset=size>=3?.6:0;
      ctx.fillRect(px+inset,py+inset,Math.max(1,size-2*inset),Math.max(1,size-2*inset));
      if(redstone&&R.parts[value])drawRedstoneMark(R.parts[value],px,py,size);
    }
  }
  function draw(){const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return;const dpr=Math.min(window.devicePixelRatio||1,3),w=Math.round(r.width*dpr),h=Math.round(r.height*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#17281f';ctx.fillRect(0,0,r.width,r.height);
    if(sparse){
      const size=sparseTile*zoom;
      view={size,ox:(r.width-size)/2+panX,oy:(r.height-size)/2+panY,originX,originY};
      drawInfinite(r);return;
    }
    const size=Math.min((r.width-28)/width,(r.height-48)/height)*zoom,ox=(r.width-size*width)/2+panX,oy=(r.height-size*height)/2+panY;view={size,ox,oy};
    const redstone=R.isPreset(rule);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const value=grid[y*width+x],px=ox+x*size,py=oy+y*size;
      if(px+size<0||py+size<0||px>r.width||py>r.height)continue;
      if(value){
        const part=redstone?R.parts[value]:null;
        ctx.fillStyle=part?part.color:color(value);
        ctx.fillRect(px+.6,py+.6,Math.max(.5,size-1.2),Math.max(.5,size-1.2));
        if(part)drawRedstoneMark(part,px,py,size);
      }else if(showGrid&&size>=4){ctx.fillStyle='#52704790';ctx.fillRect(px+size/2-.5,py+size/2-.5,1,1);}
    }
    if(showGrid&&size>=11){ctx.strokeStyle='#43634435';ctx.lineWidth=.5;ctx.beginPath();for(let x=0;x<=width;x++){ctx.moveTo(ox+x*size,oy);ctx.lineTo(ox+x*size,oy+height*size);}for(let y=0;y<=height;y++){ctx.moveTo(ox,oy+y*size);ctx.lineTo(ox+width*size,oy+y*size);}ctx.stroke();}
  }
  function refresh(){updateStats();updateCycle();draw();if(hoveredCell)showCell(hoveredCell);saveSoon();}
  function setRunning(value){if(value===running)return;running=value;clearTimeout(timer);$('play').querySelector('span').textContent=value?'暂停演化':'开始演化';$('play').firstChild.textContent=value?'Ⅱ ':'▶ ';$('run-status').textContent=value?'正在生长':'等待生长';$('status-dot').classList.toggle('running',value);$('step').disabled=value;if(value){pushHistory();tick();}}
  function evolve(remember=false){try{
    const next=sparse?W.step(sparse,rule):C.step(grid,width,height,rule,boundary);
    if(remember)pushHistory();
    if(sparse)sparse=next;else grid=next;
    generation++;
    if(cycle.period===null)cycle.observe(sparse?sparse.signature():grid,generation);
    refresh();return true;
  }catch(e){setRunning(false);ruleError(e.message);notice('演化已暂停，棋盘与代数保留在最后成功的一代。');return false;}}
  function tick(){if(!running)return;if(evolve()&&running)timer=setTimeout(tick,1000/Number($('speed').value));}
  function setFormat(next,remember=true){if(remember)drafts[format]=$('rule-text').value;format=next;$('rule-text').value=drafts[next];document.querySelectorAll('[data-format]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.format===next)));$('custom-options').hidden=next!=='table';$('expand').hidden=next!=='table';$('expression-help').hidden=next!=='expression';$('rule-text').rows=['table','expression','golly'].includes(next)?5:3;
    $('rule-description').textContent=next==='bs'?'B 指出生，S 指存活。B3/S23：有 3 个活邻居时出生，有 2 或 3 个活邻居时存活。':next==='sbc'?'S 指存活，B 指出生，C 指状态总数。仅状态 1 计入活邻居；失活后依次经过 2…C−1，再回到 0。C2 只有空白与活跃两种状态。':next==='expression'?'直接写下一状态的公式。布尔结果 true/false 对应 1/0；数值结果原样保留，可为小数或负数。在表达式里，* 是乘号。':'每行 10 项，用逗号分隔；多条规则用换行或 / 分隔。* 匹配任意状态，结果不能是 *。从上到下，第一条匹配的规则生效。';
    $('order-help').textContent=next==='table'?'中心,上,右上,右,右下,下,左下,左,左上,结果':next==='expression'?'A B C / D E F / G H I · E 为中心，结果作为 E 的下一状态。':'按顺时针读取邻居，所有元胞同时更新。';
    if(next==='golly'){
      $('rule-description').textContent='导入的 Golly 规则保留原有转移。可以检查或编辑完整规则文本，再点击“应用规则”。';
      $('order-help').textContent='使用 Golly 规则声明的四邻域或八邻域。';
    }
    document.querySelectorAll('.neighborhood b').forEach((b,i)=>{b.textContent=next==='expression'?'ABCDEFGHI'[i]:[8,1,2,7,0,3,6,5,4][i];});markDirty();}
  function markDirty(){dirty=true;$('draft-status').textContent='尚未应用';$('rule-error').hidden=true;syncDemo();}
  function applied(){dirty=false;$('draft-status').textContent='已应用';$('rule-error').hidden=true;syncDemo();syncPreset();}
  function applyRule(){try{
    const settings=spec(),next=C.compile(settings);let changed=0,textStates=0;
    if(sparse)W.requireDeterministic(next);
    const convertValue=v=>{
      if(next.format==='golly'){
        if(Number.isInteger(v)&&v>=0&&v<next.count)return v;
        changed++;return 0;
      }
      if(next.format==='expression'){
        if(rule.format==='expression'||rule.format==='golly')return v;
        const numeric=Number(rule.labels[v]);if(Number.isFinite(numeric))return numeric;textStates++;return v;
      }
      const name=rule.format==='expression'||rule.format==='golly'?String(v):rule.labels[v],index=next.labels.indexOf(name);
      if(index<0){changed++;return 0;}return index;
    };
    const converted=sparse?sparse.mapValues(convertValue):grid.map(convertValue);
    if(next.format==='expression'){
      if(sparse)W.step(converted,next);
      else C.step(converted,width,height,C.compile(settings,{random:()=>0}),boundary);
    }
    setRunning(false);pushHistory();if(sparse)sparse=converted;else grid=converted;
    rule=next;resetCycle();validateBrush();drafts[format]=$('rule-text').value;applied();palette();refresh();
    notice('已应用'+(changed?(sparse?'；未定义的状态已归零。':'；'+changed+' 个未定义状态已归零。'):textStates?'；文字状态已按调色板序号转换为数值。':'，下一代将使用这套规则。'));return true;
  }catch(e){ruleError(e.message);return false;}}
  function restore(raw,retainHistory=false,{save:s,board}=W.decodeSave(raw)){
    setRunning(false);endStroke();if(!retainHistory)history=[];
    width=s.width;height=s.height;grid=s.grid??[];sparse=board;generation=s.generation;boundary=s.boundary;rule=C.compile(s.rule);
    hoveredCell=null;worldMessage('');fitBoard(s.focus);resetCycle();drafts[rule.format]=rule.text;$('state-labels').value=rule.labels.join(',');$('fallback').value=rule.fallback||'keep';
    setFormat(rule.format,false);$('boundary').value=boundary;validateBrush();applied();palette();$('undo').disabled=!history.length;refresh();
  }
  function pointAt(px,py){
    return {x:Math.floor((px-view.ox)/view.size)+(view.originX??0),y:Math.floor((py-view.oy)/view.size)+(view.originY??0)};
  }
  function locate(e){const r=canvas.getBoundingClientRect();return pointAt(e.clientX-r.left,e.clientY-r.top);}
  function viewportFocus(){
    if(!view.size)return [originX,originY];
    const r=canvas.getBoundingClientRect(),{x,y}=pointAt(r.width/2,r.height/2);
    return [x,y].map(value=>Math.max(-W.maxCoordinate,Math.min(W.maxCoordinate,value)));
  }
  const inside=(x,y)=>x>=0&&x<width&&y>=0&&y<height;
  function paintCell(x,y){
    if(sparse){
      try{sparse.set(x,y,strokeValue);}catch(error){notice(error.message);}
    }else if(inside(x,y))grid[y*width+x]=strokeValue;
  }
  function showCell(p){
    hoveredCell=p;
    const valid=sparse?W.validCoordinate(p.x)&&W.validCoordinate(p.y):inside(p.x,p.y);
    const position=valid?'x '+p.x+' · y '+p.y:'x — · y —';
    const value=valid?(sparse?sparse.get(p.x,p.y):grid[p.y*width+p.x]):null;
    if(R.isPreset(rule)){
      const part=R.parts[value];
      $('coordinate').textContent=position+(part?' · '+part.name:'');
      $('redstone-reading').textContent=part&&part.kind!=='empty'?`${position} · ${R.describe(value)}`:'悬停在元件上，或选择“查看”后点按元件。';
    }else $('coordinate').textContent=position+(valid?' · 状态 '+(rule.format==='golly'?numberedLabel(value):label(value)):'');
  }
  function paintTo(point){if(lastCell){let {x,y}=lastCell,dx=Math.abs(point.x-x),dy=-Math.abs(point.y-y),sx=x<point.x?1:-1,sy=y<point.y?1:-1,err=dx+dy;for(let n=0;n<1000;n++){paintCell(x,y);if(x===point.x&&y===point.y)break;const e=2*err;if(e>=dy){err+=dy;x+=sx;}if(e<=dx){err+=dx;y+=sy;}}}else paintCell(point.x,point.y);lastCell=point;resetCycle();refresh();showCell(point);}
  canvas.addEventListener('pointerdown',e=>{
    if(gesturePointer!==null)return;
    if(e.button===1){e.preventDefault();const r=canvas.getBoundingClientRect();setZoom(zoom*1.25,{x:e.clientX-r.left,y:e.clientY-r.top});showCell(locate(e));return;}
    if(e.button===2||(e.button===0&&dragView)){e.preventDefault();panning={x:e.clientX,y:e.clientY,panX,panY,button:e.button===2?2:1};gesturePointer=e.pointerId;canvas.setPointerCapture(e.pointerId);canvas.classList.add('panning');return;}
    if(e.button!==0)return;const p=locate(e);if(!sparse&&!inside(p.x,p.y))return;e.preventDefault();if(inspecting){showCell(p);return;}
    setRunning(false);pushHistory();drawing=true;gesturePointer=e.pointerId;lastCell=null;strokeValue=erasing?0:brush;canvas.setPointerCapture(e.pointerId);paintTo(p);
  });
  canvas.addEventListener('pointermove',e=>{
    if(gesturePointer!==null&&e.pointerId!==gesturePointer)return;
    if(panning){if(!(e.buttons&panning.button)){endStroke(e);return;}panX=panning.panX+e.clientX-panning.x;panY=panning.panY+e.clientY-panning.y;draw();showCell(locate(e));return;}
    const p=locate(e);showCell(p);if(drawing){if(e.buttons&1)paintTo(p);else endStroke(e);}
  });
  function endStroke(e){if(e&&e.pointerId!==undefined&&e.pointerId!==gesturePointer)return;const id=gesturePointer;if(panning&&sparse)saveSoon();drawing=false;panning=null;gesturePointer=null;lastCell=null;canvas.classList.remove('panning');if(id!==null&&canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);}
  canvas.addEventListener('pointerup',endStroke);canvas.addEventListener('pointercancel',endStroke);canvas.addEventListener('lostpointercapture',endStroke);canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.addEventListener('auxclick',e=>{if(e.button===1)e.preventDefault();});
  canvas.addEventListener('wheel',e=>{if(!e.deltaY)return;e.preventDefault();endStroke();const r=canvas.getBoundingClientRect(),delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?r.height:1);setZoom(zoom*Math.exp(-Math.max(-.7,Math.min(.7,delta*.002))),{x:e.clientX-r.left,y:e.clientY-r.top});showCell(locate(e));},{passive:false});
  $('play').onclick=()=>setRunning(!running);$('step').onclick=()=>evolve(true);
  $('undo').onclick=()=>{if(history.length){restore(history.pop(),true);notice('已撤销上次操作。');}};
  $('speed').oninput=()=>{$('speed-value').textContent=$('speed').value+' 代/秒';};
  $('random').onclick=()=>{try{
    if(sparse){
      const next=sparse.copy(),[cx,cy]=viewportFocus(),r=canvas.getBoundingClientRect();
      const cols=Math.min(160,Math.max(1,Math.floor(r.width/view.size))),rows=Math.min(120,Math.max(1,Math.floor(r.height/view.size)));
      for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)next.set(cx-Math.floor(cols/2)+x,cy-Math.floor(rows/2)+y,Math.random()<.24?1:0);
      setRunning(false);pushHistory();sparse=next;
    }else{setRunning(false);pushHistory();grid=grid.map(()=>Math.random()<.24?1:0);}
    generation=0;resetCycle();refresh();notice(sparse?'已在视野中央随机播种。':'已随机播种，点击开始演化。');
  }catch(error){notice(error.message);}};
  $('clear').onclick=()=>{setRunning(false);pushHistory();if(sparse)sparse=new W.SparseBoard();else grid.fill(0);generation=0;resetCycle();refresh();notice('棋盘已清空，可以重新绘制。');};
  $('eraser').onclick=()=>{erasing=!erasing;inspecting=false;palette();};$('inspect').onclick=()=>{inspecting=!inspecting;erasing=false;palette();};$('apply').onclick=applyRule;
  function setNumericBrush(){const text=$('numeric-brush').value.trim(),value=Number(text);if(!text||!Number.isFinite(value)){ruleError('数值画笔必须是有限数字，例如 -0.5、12 或 1e3');return;}brush=value;erasing=false;inspecting=false;palette();notice('画笔数值已设为 '+value+'。');}
  $('set-brush').onclick=setNumericBrush;$('numeric-brush').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();setNumericBrush();}};
  document.querySelectorAll('[data-format]').forEach(b=>b.onclick=()=>setFormat(b.dataset.format));
  ['rule-text','state-labels','fallback'].forEach(id=>$(id).addEventListener('input',markDirty));
  $('preset').onchange=()=>{const [f,t]=presets[$('preset').value];setFormat(f);$('rule-text').value=t;if(f==='table')$('state-labels').value=$('preset').value==='signal'?'0,火,水':'0,1';markDirty();notice('已载入规则，点击“应用规则”后生效。');};
  $('wireworld-demo').onclick=()=>{pushHistory();restore(P.wireworldDemo(),true);brush=3;erasing=false;inspecting=false;validateBrush();palette();notice('电线示例已载入，点击开始演化。蓝色电子头沿黄色导线移动，红色是电子尾；可撤销恢复原棋盘。');};
  $('redstone-demo').onclick=()=>{
    pushHistory();
    brush=R.dust;erasing=false;inspecting=false;
    restore(R.demo(),true);
    notice('红石示例已载入。用“单步”观察上排信号，也可擦掉下排左端的红石块测试反相。');
    $('board').scrollIntoView({block:'nearest'});
  };
  $('redstone-direction').onchange=$('redstone-delay').onchange=()=>{validateBrush();palette();};
  $('boundary').onchange=()=>{setRunning(false);pushHistory();boundary=$('boundary').value;resetCycle();refresh();};
  function setZoom(z,anchor){
    const r=canvas.getBoundingClientRect(),next=sparse?Math.max(Math.min(.6,.05/sparseTile),Math.min(120/sparseTile,z)):Math.max(.6,Math.min(4,z));
    const ratio=next/zoom,p=anchor||{x:r.width/2,y:r.height/2};
    panX=ratio*panX+(1-ratio)*(p.x-r.width/2);panY=ratio*panY+(1-ratio)*(p.y-r.height/2);zoom=next;
    const tile=sparseTile*zoom;
    $('zoom-value').textContent=sparse?(tile<1?'<1 px':Math.round(tile)+' px'):Math.round(zoom*100)+'%';
    draw();if(sparse)saveSoon();
  }
  function fitBoard(focus=null,area=null){
    endStroke();panX=0;panY=0;
    if(sparse){
      const bounds=area??sparse.bounds(),r=canvas.getBoundingClientRect();
      if(focus){[originX,originY]=focus;sparseTile=18;}
      else if(bounds){
        originX=Math.floor((bounds.minX+bounds.maxX)/2);originY=Math.floor((bounds.minY+bounds.maxY)/2);
        sparseTile=Math.min(18,Math.max(1,r.width-40)/(bounds.maxX-bounds.minX+2),Math.max(1,r.height-56)/(bounds.maxY-bounds.minY+2));
      }else{originX=0;originY=0;sparseTile=18;}
    }
    setZoom(1);
  }
  $('zoom-in').onclick=()=>setZoom(zoom*1.25);$('zoom-out').onclick=()=>setZoom(zoom/1.25);$('fit').onclick=()=>fitBoard();$('grid-toggle').onclick=()=>{showGrid=!showGrid;$('grid-toggle').setAttribute('aria-pressed',String(showGrid));draw();};
  $('drag-view').onclick=()=>{
    endStroke();dragView=!dragView;
    $('drag-view').setAttribute('aria-pressed',String(dragView));canvas.classList.toggle('pan-tool',dragView);
  };
  function openSize(){
    setRunning(false);endStroke();
    $('resize-width').value=String(width);$('resize-height').value=String(height);$('size-error').hidden=true;
    $('size-title').textContent=sparse?'切回有限棋盘':'棋盘尺寸';
    $('size-description').textContent=sparse?'保留从 (0, 0) 开始的矩形区域。区域外的元胞会裁掉，可以撤销。':'按左上角对齐保留元胞，新增区域为空白。缩小会裁掉右侧和下侧，可用“撤销”恢复。';
    $('size-dialog').showModal();
  }
  $('board-size').onclick=openSize;
  $('infinite-toggle').onclick=()=>{
    if(sparse){openSize();return;}
    try{
      W.requireDeterministic(rule);
      const next=W.fromDense(grid,width);
      setRunning(false);endStroke();pushHistory();sparse=next;grid=[];
      hoveredCell=null;fitBoard();resetCycle();refresh();worldMessage('已切换到无限棋盘，元胞保留原坐标。');
    }catch(error){worldMessage(error.message);}
  };
  const closeSize=()=>$('size-dialog').close();$('size-close').onclick=closeSize;$('size-cancel').onclick=closeSize;
  $('resize-form').onsubmit=e=>{e.preventDefault();try{
    const nextWidth=Number($('resize-width').value),nextHeight=Number($('resize-height').value),wasInfinite=Boolean(sparse);
    const next=sparse?W.toDense(sparse,nextWidth,nextHeight):C.resize(grid,width,height,nextWidth,nextHeight);
    if(!wasInfinite&&next.width===width&&next.height===height){closeSize();notice('棋盘尺寸保持 '+width+' × '+height+'。');return;}
    pushHistory();sparse=null;grid=next.grid;width=next.width;height=next.height;resetCycle();hoveredCell=null;fitBoard();refresh();closeSize();
    if(wasInfinite){worldMessage('已切回有限棋盘，可撤销恢复无限棋盘。');return;}
    notice('棋盘已调整为 '+width+' × '+height+'，'+(next.cropped?'裁去 '+next.cropped+' 个非零元胞':'重叠区域已保留')+'；可撤销恢复。');
  }catch(error){$('size-error').textContent=error.message;$('size-error').hidden=false;}};
  $('expand').onclick=()=>{try{const r=C.compile(spec()),e=C.expansion(r);$('expansion-info').textContent='共 '+e.total.toLocaleString()+' 条，展示前 '+e.lines.length+' 条（保持原有优先顺序）。';$('expansion-lines').textContent=e.lines.join('\n');$('expansion-dialog').showModal();}catch(e){$('rule-error').textContent=e.message;$('rule-error').hidden=false;}};$('close-dialog').onclick=()=>$('expansion-dialog').close();
  $('export').onclick=()=>{const blob=new Blob([JSON.stringify(snapshot(),null,sparse?0:2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='cell-lab-generation-'+generation+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice('已导出当前棋盘与已应用规则'+(dirty?'；未应用的草稿未导出。':'。'));};
  $('import').onclick=()=>$('file').click();$('file').onchange=async()=>{const f=$('file').files[0];if(!f)return;try{if(f.size>8*1024*1024)throw Error('文件大小不能超过 8 MiB');const raw=JSON.parse(await f.text()),decoded=W.decodeSave(raw);pushHistory();restore(raw,true,decoded);notice('存档已导入。');}catch(e){$('rule-error').textContent='导入失败：'+e.message;$('rule-error').hidden=false;}$('file').value='';};
  const patternDialog=$('pattern-dialog'),patternSource=$('pattern-source');
  let patternRead=0;
  function patternError(message){$('pattern-error').textContent=message;$('pattern-error').hidden=false;}
  $('pattern-open').onclick=()=>{
    patternRead++;patternSource.value='';patternSource.disabled=false;$('pattern-place').disabled=false;
    $('pattern-x').value='';$('pattern-y').value='';$('pattern-error').hidden=true;
    patternDialog.showModal();
  };
  $('pattern-close').onclick=()=>patternDialog.close();
  $('pattern-pick').onclick=()=>$('pattern-file').click();
  $('pattern-file').onchange=async event=>{
    const input=event.currentTarget,file=input.files[0];input.value='';if(!file)return;
    const request=++patternRead;
    patternSource.value='';patternSource.disabled=true;$('pattern-place').disabled=true;$('pattern-error').hidden=true;
    try{
      if(file.size>Pattern.maxBytes)throw Error('RLE 文件需在 2 MiB 以内。');
      const text=await file.text();
      if(patternDialog.open&&request===patternRead)patternSource.value=text;
    }catch(error){if(patternDialog.open&&request===patternRead)patternError(error.message);}
    finally{
      if(patternDialog.open&&request===patternRead){patternSource.disabled=false;$('pattern-place').disabled=false;patternSource.focus();}
    }
  };
  $('pattern-form').oninput=()=>$('pattern-error').hidden=true;
  $('pattern-form').onsubmit=event=>{
    event.preventDefault();
    try{
      const pattern=Pattern.readRle(patternSource.value),[cx,cy]=viewportFocus();
      const fallback=pattern.position??[cx-Math.floor(pattern.width/2),cy-Math.floor(pattern.height/2)];
      const [x0,y0]=['pattern-x','pattern-y'].map((id,i)=>$(id).value.trim()?Number($(id).value):fallback[i]);
      if(!W.validCoordinate(x0)||!W.validCoordinate(y0))throw Error('左上角坐标须为可精确计算的整数。');
      let useInfinite=Boolean(sparse);
      const bounds={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
      const cells=pattern.cells.map(([x,y,value])=>{
        x+=x0;y+=y0;
        if(!W.validCoordinate(x)||!W.validCoordinate(y))throw Error('图案放置后超出坐标范围。');
        if(!W.validState(rule,value))throw Error(`图案使用状态 ${value}${pattern.rule?`（${pattern.rule.slice(0,80)}）`:''}，请先应用支持该状态的规则。`);
        if(!inside(x,y))useInfinite=true;
        bounds.minX=Math.min(bounds.minX,x);bounds.maxX=Math.max(bounds.maxX,x);
        bounds.minY=Math.min(bounds.minY,y);bounds.maxY=Math.max(bounds.maxY,y);
        return [x,y,value];
      });
      let next;
      if(useInfinite){
        W.requireDeterministic(rule);next=sparse?sparse.copy():W.fromDense(grid,width);
        for(const [x,y,value] of cells)next.set(x,y,value);
      }else{
        next=grid.slice();
        for(const [x,y,value] of cells)next[y*width+x]=value;
      }
      const switched=useInfinite&&!sparse;
      setRunning(false);endStroke();pushHistory();
      if(useInfinite){sparse=next;grid=[];}else grid=next;
      hoveredCell=null;patternDialog.close();fitBoard(null,bounds);resetCycle();refresh();
      const message=`已放置 ${cells.length.toLocaleString()} 个元胞，左上角 (${x0}, ${y0})。`;
      worldMessage(message+(switched?' 已切换到无限棋盘。':''));
      $('board').focus({preventScroll:true});$('board').scrollIntoView({block:'nearest'});
    }catch(error){patternError(error.message);}
  };
  const gollyImportDialog=$('golly-import-dialog'),gollySource=$('golly-source');
  let fileRead=0;
  function showImportError(message){
    $('golly-import-error').textContent=message;$('golly-import-error').hidden=false;
  }
  $('golly-import-open').onclick=()=>{
    fileRead++;
    gollySource.value='';gollySource.disabled=false;$('golly-load').disabled=false;
    $('golly-import-error').hidden=true;
    gollyImportDialog.showModal();
  };
  $('golly-import-close').onclick=()=>gollyImportDialog.close();
  $('golly-pick-file').onclick=()=>$('golly-file').click();
  $('golly-file').onchange=async event=>{
    const input=event.currentTarget,file=input.files[0];
    input.value='';if(!file)return;
    const request=++fileRead;
    gollySource.value='';gollySource.disabled=true;$('golly-load').disabled=true;$('golly-import-error').hidden=true;
    try{
      if(file.size>GollyInput.maxBytes)throw Error('Golly 规则文件需在 1 MiB 以内');
      const text=await file.text();
      if(gollyImportDialog.open&&request===fileRead)gollySource.value=text;
    }catch(error){if(gollyImportDialog.open&&request===fileRead)showImportError(error.message);}
    finally{
      if(gollyImportDialog.open&&request===fileRead){gollySource.disabled=false;$('golly-load').disabled=false;gollySource.focus();}
    }
  };
  gollySource.oninput=()=>$('golly-import-error').hidden=true;
  $('golly-import-form').onsubmit=event=>{
    event.preventDefault();
    try{
      const next=GollyInput.sourceSpec(gollySource.value);
      C.compile(next);
      drafts[format]=$('rule-text').value;drafts[next.format]=next.text;
      setFormat(next.format,false);
      gollyImportDialog.close();
      notice('Golly 规则已载入编辑器。点击“应用规则”开始使用。');
      $('apply').focus();
    }catch(error){showImportError(error.message);}
  };
  let gollyRule=null,gollyResult=null,gollyAbort=null;
  function clearGolly(){if(gollyAbort)gollyAbort.abort();gollyAbort=null;gollyResult=null;$('golly-output').value='';$('golly-copy').disabled=true;$('golly-download').hidden=true;$('golly-instructions').textContent='';$('golly-error').hidden=true;$('golly-status').textContent='';$('golly-generate').disabled=false;}
  async function generateGolly(){
    clearGolly();const controller=new AbortController();gollyAbort=controller;$('golly-generate').disabled=true;$('golly-status').textContent='正在检查并转换规则…';
    try{const result=await window.CellGolly.convert(gollyRule,{stateCount:Number($('golly-count').value),signal:controller.signal,onProgress:f=>{if(gollyAbort===controller)$('golly-status').textContent='正在检查全部邻域… '+Math.round(f*100)+'%';}});
      if(gollyAbort!==controller||!$('golly-dialog').open)return;gollyResult=result;$('golly-output').value=result.text;$('golly-copy').disabled=false;$('golly-download').hidden=result.kind!=='rule';
      $('golly-status').textContent='已就绪 · '+result.algorithm;
      $('golly-instructions').textContent=result.kind==='string'?'复制后，在 Golly 选择 Control → Set Rule（设置规则），粘贴到规则输入框，再确认。':'复制后，在 Golly 选择 File → Open Clipboard（打开剪贴板），或 Edit → Paste（粘贴），安装并切换规则。也可下载 .rule 文件后用 Golly 打开。';
    }catch(e){if(gollyAbort===controller&&e.name!=='AbortError'){$('golly-error').textContent=e.message;$('golly-error').hidden=false;$('golly-status').textContent='未生成规则';}}
    finally{if(gollyAbort===controller)$('golly-generate').disabled=false;}
  }
  $('golly-open').onclick=()=>{
    clearGolly();gollyRule=C.compile(C.ruleSpec(rule));
    const needsCount=gollyRule.format==='expression'&&!R.isPreset(gollyRule);
    $('golly-expression').hidden=!needsCount;$('golly-count').value=P.isWireworld(gollyRule)?'4':'2';
    $('golly-dialog').showModal();
    if(needsCount)$('golly-status').textContent='请选择完整状态数，然后生成规则。';
    else generateGolly();
  };
  $('golly-close').onclick=()=>$('golly-dialog').close();$('golly-dialog').addEventListener('close',clearGolly);$('golly-dialog').addEventListener('cancel',clearGolly);$('golly-generate').onclick=generateGolly;$('golly-count').onchange=clearGolly;
  $('golly-copy').onclick=async()=>{const result=gollyResult;if(!result)return;try{await navigator.clipboard.writeText(result.text);if(gollyResult===result&&$('golly-dialog').open)$('golly-status').textContent='已复制，请按下方步骤在 Golly 中粘贴。';}catch{if(gollyResult!==result||!$('golly-dialog').open)return;$('golly-output').focus();$('golly-output').select();$('golly-status').textContent='自动复制不可用，内容已选中。请按 Ctrl+C（手机长按复制），再到 Golly 粘贴。';}};
  $('golly-download').onclick=()=>{if(!gollyResult||gollyResult.kind!=='rule')return;const url=URL.createObjectURL(new Blob([gollyResult.text],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=gollyResult.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  document.addEventListener('keydown',e=>{if(e.code==='Space'&&!e.repeat&&!/INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName)&&!document.querySelector('dialog[open]')){e.preventDefault();setRunning(!running);}});
  window.addEventListener('blur',()=>endStroke());document.addEventListener('visibilitychange',()=>{if(document.hidden){endStroke();setRunning(false);}});window.addEventListener('pagehide',()=>{try{localStorage.setItem(KEY,JSON.stringify(snapshot()));}catch{/* Existing save status already exposes storage availability. */}});
  new ResizeObserver(draw).observe($('canvas-wrap'));
  // A deterministic seed keeps the first visit interesting and reproducible.
  let seed=7289;
  for(let y=8;y<40;y++)for(let x=17;x<55;x++){
    seed=(seed*16807)%2147483647;
    if(((x-36)/18)**2+((y-24)/15)**2<1&&seed/2147483647<.32)grid[y*width+x]=1;
  }
  resetCycle();
  try{const raw=localStorage.getItem(KEY);if(raw)restore(JSON.parse(raw));else{palette();refresh();}}catch{palette();refresh();notice('本地存档无效，已载入初始种子。');}
  // Read-only state and coordinate access make browser acceptance checks reliable.
  window.CellLab={getState:()=>snapshot(),getView:()=>({...view,running,brush,zoom,panX,panY,panning:!!panning}),getDraft:()=>spec()};
})();
