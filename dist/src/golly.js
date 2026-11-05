(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./core.js'):root.CellCore);if(typeof module==='object'&&module.exports)module.exports=api;else root.CellGolly=api;})(typeof globalThis!=='undefined'?globalThis:this,function(C){
  'use strict';
  const TREE_ORDER=[8,2,6,4,1,7,3,5,0];
  const digits=set=>[...set].sort((a,b)=>a-b).join('');
  function nameFor(rule,count){const s=JSON.stringify([C.ruleSpec(rule),count]);let a=2166136261,b=5381;for(let i=0;i<s.length;i++){a=Math.imul(a^s.charCodeAt(i),16777619);b=Math.imul(b,33)^s.charCodeAt(i);}return 'CellLab_'+(a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');}
  function stringRule(text,algorithm){return {kind:'string',text,algorithm,ruleName:text,filename:null};}
  function fileRule(rule,count,body){const ruleName=nameFor(rule,count);return {kind:'rule',text:'@RULE '+ruleName+'\n\n'+body+'\n',algorithm:'RuleLoader',ruleName,filename:ruleName+'.rule'};}
  function variables(prefix,states){return Array.from({length:9},(_,i)=>'var '+prefix+i+'={'+states.join(',')+'}').join('\n');}
  function table(rule){const states=Array.from({length:rule.count},(_,i)=>i); // Each wildcard position needs its own unbound variable.
    const rows=rule.rules.map(row=>row.map((v,i)=>v===-1?'a'+i:v).join(','));
    if(rule.fallback==='zero')rows.push(Array.from({length:9},(_,i)=>'a'+i).concat(0).join(','));
    return fileRule(rule,rule.count,'@TABLE\nn_states:'+rule.count+'\nneighborhood:Moore\nsymmetries:none\n'+variables('a',states)+'\n'+rows.join('\n')+'\n\n@NAMES\n'+rule.labels.map((v,i)=>i+' '+v).join('\n'));
  }
  function generationsB0(rule){const count=rule.count,states=Array.from({length:count},(_,i)=>i),rows=[];
    for(const [center,counts] of [[0,rule.birth],[1,rule.survive]])for(const n of [...counts].sort((a,b)=>a-b))rows.push([center,...Array(n).fill(1),...Array.from({length:8-n},(_,i)=>'d'+i),1].join(','));
    for(let center=1;center<count;center++)rows.push([center,...Array.from({length:8},(_,i)=>'a'+i),(center+1)%count].join(','));
    return fileRule(rule,count,'@TABLE\nn_states:'+count+'\nneighborhood:Moore\nsymmetries:permute\n'+variables('a',states)+'\n'+variables('d',states.filter(v=>v!==1))+'\n'+rows.join('\n'));
  }
  function abort(signal){if(signal&&signal.aborted){const e=Error('已取消生成');e.name='AbortError';throw e;}}
  async function convert(rule,options={}){
    abort(options.signal);
    if(rule.format==='bs')return stringRule('B'+digits(rule.birth)+'/S'+digits(rule.survive),'QuickLife');
    if(rule.format==='sbc'){
      if(!rule.birth.has(0))return stringRule(digits(rule.survive)+'/'+digits(rule.birth)+'/'+rule.count,'Generations');
      return rule.count===2?stringRule('B'+digits(rule.birth)+'/S'+digits(rule.survive),'QuickLife'):generationsB0(rule);
    }
    if(rule.format==='table')return table(rule);
    if(rule.format!=='expression')throw Error('不支持的规则格式');
    if(!rule.deterministic)throw Error('含 random 的规则不能等价转换为 Golly 确定性规则。');
    const count=options.stateCount;
    if(!Number.isInteger(count)||count<2||count>4)throw Error('请选择 2–4 个状态；状态必须完整包含在 0…C−1 中。');
    const nodes=[],interned=new Map(),n=Array(9).fill(0),total=count**8;
    const intern=(depth,children)=>{const key=depth+' '+children.join(' ');if(interned.has(key))return interned.get(key);const id=nodes.length;nodes.push(key);interned.set(key,id);return id;};
    let level=new Uint32Array(total);
    const yieldControl=options.yieldControl||(()=>new Promise(resolve=>setTimeout(resolve,0)));
    for(let k=0;k<total;k++){
      let v=k;for(let p=7;p>=0;p--){n[TREE_ORDER[p]]=v%count;v=Math.floor(v/count);}
      const outputs=[];
      for(let center=0;center<count;center++){n[0]=center;const result=C.transition(rule,n);if(!Number.isInteger(result)||result<0||result>=count)throw Error('状态数 '+count+' 的某个邻域输出 '+result+'，不在整数状态 0–'+(count-1)+' 内。');outputs.push(result);}
      level[k]=intern(1,outputs);
      if((k+1)%1024===0){if(options.onProgress)options.onProgress((k+1)/total);await yieldControl();abort(options.signal);}
    }
    for(let depth=2;depth<=9;depth++){const next=new Uint32Array(level.length/count);for(let i=0;i<next.length;i++)next[i]=intern(depth,Array.from(level.subarray(i*count,(i+1)*count)));level=next;}
    abort(options.signal);
    return fileRule(rule,count,'@TREE\nnum_states='+count+'\nnum_neighbors=8\nnum_nodes='+nodes.length+'\n'+nodes.join('\n'));
  }
  return {convert};
});
