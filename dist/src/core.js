(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./expression.js'):root.CellExpression);if(typeof module==='object'&&module.exports)module.exports=api;else root.CellCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(Expression){
  'use strict';
  const DIRECTIONS=[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
  function validateDimensions(width,height){if(!Number.isInteger(width)||width<3||width>160)throw Error('宽度必须是 3–160 的整数');if(!Number.isInteger(height)||height<3||height>120)throw Error('高度必须是 3–120 的整数');}
  function resize(grid,width,height,newWidth,newHeight){
    validateDimensions(width,height);validateDimensions(newWidth,newHeight);
    if(!Array.isArray(grid)||grid.length!==width*height)throw Error('原棋盘数据与尺寸不匹配');
    const next=Array(newWidth*newHeight).fill(0);let cropped=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){const value=grid[y*width+x];if(x<newWidth&&y<newHeight)next[y*newWidth+x]=value;else if(value!==0)cropped++;}
    return {width:newWidth,height:newHeight,grid:next,cropped};
  }
  function compile(spec,options){
    if(!spec||typeof spec.text!=='string'||spec.text.length>65536)throw Error('规则不能为空，且不能超过 65536 字符');
    const format=spec.format,text=spec.text.trim();
    if(format==='expression')return {format,text,count:null,labels:['0','1','2','3'],evaluate:Expression.compile(text,options)};
    if(format==='bs'||format==='sbc'){
      const clean=text.toUpperCase().replace(/\s/g,''),m=clean.match(format==='bs'?/^B([0-8]*)\/S([0-8]*)$/:/^S([0-8]*)\/B([0-8]*)\/C(\d+)$/);
      if(!m)throw Error(format==='bs'?'格式示例：B3/S23；邻居数为 0–8':'格式示例：S23/B2/C2；S、B 为 0–8 的邻居数');
      const count=format==='bs'?2:Number(m[3]);if(count<2||count>32)throw Error('C 状态数必须为 2–32');
      return {format,text,count,labels:Array.from({length:count},(_,i)=>String(i)),birth:new Set([...(format==='bs'?m[1]:m[2])].map(Number)),survive:new Set([...(format==='bs'?m[2]:m[1])].map(Number))};
    }
    if(format!=='table')throw Error('未知规则格式');
    const labels=typeof spec.labels==='string'?spec.labels.split(/[,，]/).map(s=>s.trim()):spec.labels;
    if(!Array.isArray(labels)||labels.length<2||labels.length>32||labels[0]!=='0'||labels.some(s=>typeof s!=='string'||!s||s.length>16||/[\s*,，/#>]/.test(s))||new Set(labels).size!==labels.length)throw Error('请输入 2–32 个不重复状态，以 0 开头；每个状态最多 16 字，不含空白、星号或分隔符');
    const rows=text.split('\n').map(s=>s.split('#')[0]).join('\n').split(/[\n/]/).map(s=>s.trim()).filter(Boolean);
    if(!rows.length||rows.length>256)throw Error('请输入 1–256 条规则');
    const rules=rows.map((row,i)=>{const parts=row.split(/[,，]/).map(s=>s.trim());if(parts.length!==10)throw Error('第 '+(i+1)+' 条需有 10 项（中心 + 八邻居 + 结果），现有 '+parts.length+' 项');
      return parts.map((s,j)=>{if(s==='*'&&j<9)return -1;const n=labels.indexOf(s);if(n<0)throw Error('第 '+(i+1)+' 条第 '+(j+1)+' 项：'+(s==='*'?'结果不能是 *':'未定义状态「'+s+'」'));return n;});});
    if(spec.fallback!==undefined&&!['keep','zero'].includes(spec.fallback))throw Error('无效的未匹配行为');
    return {format,text,count:labels.length,labels:[...labels],rules,fallback:spec.fallback||'keep'};
  }
  function transition(rule,n){
    if(rule.format==='expression')return rule.evaluate(n);
    if(rule.format==='table'){for(const row of rule.rules){let match=true;for(let i=0;i<9;i++)if(row[i]!==-1&&row[i]!==n[i]){match=false;break;}if(match)return row[9];}return rule.fallback==='zero'?0:n[0];}
    let active=0;for(let i=1;i<9;i++)if(n[i]===1)active++;
    if(n[0]===0)return rule.birth.has(active)?1:0;
    if(n[0]===1)return rule.survive.has(active)?1:(rule.count>2?2:0);
    return (n[0]+1)%rule.count;
  }
  function step(grid,width,height,rule,boundary){const next=Array(grid.length),n=Array(9);for(let y=0;y<height;y++)for(let x=0;x<width;x++){n[0]=grid[y*width+x];for(let d=0;d<8;d++){let xx=x+DIRECTIONS[d][0],yy=y+DIRECTIONS[d][1];if(boundary==='wrap'){xx=(xx+width)%width;yy=(yy+height)%height;}n[d+1]=xx<0||yy<0||xx>=width||yy>=height?0:grid[yy*width+xx];}try{next[y*width+x]=transition(rule,n);}catch(e){throw Error('元胞 ('+x+', '+y+')：'+e.message);}}return next;}
  function expansion(rule,limit=128){if(rule.format!=='table')return {total:0,lines:[]};const lines=[];let total=0;for(const row of rule.rules){const positions=[];for(let i=0;i<9;i++)if(row[i]===-1)positions.push(i);const count=rule.count**positions.length;total+=count;for(let k=0;k<count&&lines.length<limit;k++){const copy=[...row];let v=k;for(const p of positions){copy[p]=v%rule.count;v=Math.floor(v/rule.count);}lines.push(copy.map(i=>rule.labels[i]).join(','));}}return {total,lines};}
  function ruleSpec(rule){return {format:rule.format,text:rule.text,labels:[...rule.labels],...(rule.format==='table'?{fallback:rule.fallback}:{})};}
  function validateSave(s){if(!s||s.version!==1)throw Error('不支持的存档版本');const {width,height,generation,boundary}=s;validateDimensions(width,height);const r=compile(s.rule);if(!Array.isArray(s.grid)||s.grid.length!==width*height||s.grid.some(v=>r.format==='expression'?typeof v!=='number'||!Number.isFinite(v):!Number.isInteger(v)||v<0||v>=r.count))throw Error('棋盘状态数据无效');if(!Number.isSafeInteger(generation)||generation<0||!['wrap','zero'].includes(boundary))throw Error('代数或边界数据无效');return {version:1,width,height,generation,boundary,rule:ruleSpec(r),grid:[...s.grid]};}
  return {compile,transition,step,expansion,validateSave,ruleSpec,resize,DIRECTIONS};
});
