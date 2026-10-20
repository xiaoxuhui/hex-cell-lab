/* jsep parses syntax; only the operators and variables below can be evaluated. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('../vendor/jsep-1.4.0/dist/cjs/jsep.cjs.js'));
  else root.CellExpression=factory(root.jsep);
})(typeof globalThis!=='undefined'?globalThis:this,function(parse){
  'use strict';
  const variables=Object.create(null);
  // Public positions are row-major; the engine supplies center, then clockwise.
  const slots=[8,1,2,7,0,3,6,5,4];
  'ABCDEFGHI'.split('').forEach((name,i)=>{variables[name]=n=>n[slots[i]];});
  variables.n=n=>{let count=0;for(let i=1;i<9;i++)if(n[i]===1)count++;return count;};
  variables.sum=n=>{let total=0;for(let i=1;i<9;i++)total+=n[i];return total;};
  const unary={'!':v=>!v,'+':v=>+v,'-':v=>-v,'~':v=>~v};
  const binary={
    '+':(a,b)=>Number(a)+Number(b),'-':(a,b)=>a-b,'*':(a,b)=>a*b,'/':(a,b)=>a/b,'%':(a,b)=>a%b,'**':(a,b)=>a**b,
    '<':(a,b)=>a<b,'<=':(a,b)=>a<=b,'>':(a,b)=>a>b,'>=':(a,b)=>a>=b,
    '==':(a,b)=>a==b,'!=':(a,b)=>a!=b,'===':(a,b)=>a===b,'!==':(a,b)=>a!==b,
    '&':(a,b)=>a&b,'|':(a,b)=>a|b,'^':(a,b)=>a^b,'<<':(a,b)=>a<<b,'>>':(a,b)=>a>>b,'>>>':(a,b)=>a>>>b
  };
  const functions={min:[Math.min,1,32],max:[Math.max,1,32],abs:[Math.abs,1,1],floor:[Math.floor,1,1],ceil:[Math.ceil,1,1],round:[Math.round,1,1],sqrt:[Math.sqrt,1,1],pow:[Math.pow,2,2]};
  function compile(text,{random=()=>Math.random()}={}){
    if(typeof text!=='string'||!text.trim()||text.length>8192)throw Error('表达式需有 1–8192 个字符');
    if(typeof random!=='function')throw Error('随机源必须是函数');
    const source=text.replace(/[（]/g,'(').replace(/[）]/g,')').replace(/^\s*next\s*=(?!=)\s*/,'');
    let nesting=0;
    for(const ch of source){if(ch==='('&&++nesting>64)throw Error('括号嵌套最多 64 层');if(ch===')')nesting--;}
    let ast;
    try{ast=parse(source);}catch(e){throw Error('表达式语法错误'+(Number.isInteger(e.index)?'（第 '+(e.index+1)+' 字）':'')+'：'+(e.description||e.message));}
    let nodes=0;
    function build(node,depth=0){
      if(++nodes>1024||depth>512)throw Error('表达式过于复杂：最多 1024 个节点、512 层运算');
      const child=n=>build(n,depth+1);
      switch(node.type){
        case 'Literal':
          if(typeof node.value!=='boolean'&&typeof node.value!=='number')throw Error('表达式只接受数字与 true/false 常量');
          return ()=>node.value;
        case 'Identifier':
          if(!Object.hasOwn(variables,node.name))throw Error('未知变量「'+node.name+'」，请使用 A–I、n 或 sum（E 为中心）');
          return variables[node.name];
        case 'UnaryExpression': {
          if(!Object.hasOwn(unary,node.operator))throw Error('不支持的运算符 '+node.operator);
          const operand=child(node.argument),operation=unary[node.operator];return n=>operation(operand(n));
        }
        case 'BinaryExpression': {
          const left=child(node.left),right=child(node.right);
          if(node.operator==='&&')return n=>left(n)&&right(n);
          if(node.operator==='||')return n=>left(n)||right(n);
          if(!Object.hasOwn(binary,node.operator))throw Error('不支持的运算符 '+node.operator);
          const operation=binary[node.operator];return n=>operation(left(n),right(n));
        }
        case 'ConditionalExpression': {
          const condition=child(node.test),yes=child(node.consequent),no=child(node.alternate);return n=>condition(n)?yes(n):no(n);
        }
        case 'CallExpression': {
          if(node.callee.type==='Identifier'&&node.callee.name==='random'){
            if(node.arguments.length!==1||node.arguments[0].type!=='ArrayExpression')throw Error('random 需要一个列表参数，例如 random([0,1,2,3])');
            const items=node.arguments[0].elements;
            if(items.length<1||items.length>256)throw Error('随机列表需有 1–256 项');
            if(items.some(item=>!item))throw Error('随机列表中不允许留空项');
            const choices=items.map(child);
            return n=>{const sample=random();if(typeof sample!=='number'||!Number.isFinite(sample)||sample<0||sample>=1)throw Error('随机源必须返回 0（含）到 1（不含）的数字');return choices[Math.floor(sample*choices.length)](n);};
          }
          if(node.callee.type!=='Identifier'||!Object.hasOwn(functions,node.callee.name))throw Error('只支持 random/min/max/abs/floor/ceil/round/sqrt/pow 函数');
          const [fn,min,max]=functions[node.callee.name],args=node.arguments.map(child);
          if(args.length<min||args.length>max)throw Error(node.callee.name+' 参数数量应为 '+(min===max?min:min+'–'+max));
          return n=>fn(...args.map(arg=>arg(n)));
        }
        default:throw Error('不支持此写法：请使用一个数值、逻辑或条件表达式');
      }
    }
    const run=build(ast);
    return n=>{const raw=run(n),value=typeof raw==='boolean'?Number(raw):raw;if(typeof value!=='number'||!Number.isFinite(value))throw Error('表达式结果必须是有限数值或布尔值，请检查除零、溢出或函数参数');return value;};
  }
  return {compile};
});
