/* jsep parses syntax; only the operators and variables below can be evaluated. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('../vendor/jsep-1.4.0/dist/cjs/jsep.cjs.js'));
  else root.CellExpression=factory(root.jsep);
})(typeof globalThis!=='undefined'?globalThis:this,function(parse){
  'use strict';
  const variables=Object.create(null);
  const chinese=['中心','上','右上','右','右下','下','左下','左','左上'];
  const english=['C','N','NE','E','SE','S','SW','W','NW'];
  chinese.forEach((name,i)=>{variables[name]=n=>n[i];variables[english[i]]=n=>n[i];});
  variables.c=variables.C;
  variables.邻居数=variables.n=n=>{let count=0;for(let i=1;i<9;i++)if(n[i]===1)count++;return count;};
  variables.邻居和=variables.sum=n=>{let total=0;for(let i=1;i<9;i++)total+=n[i];return total;};
  const unary={'!':v=>!v,'+':v=>+v,'-':v=>-v,'~':v=>~v};
  const binary={
    '+':(a,b)=>Number(a)+Number(b),'-':(a,b)=>a-b,'*':(a,b)=>a*b,'/':(a,b)=>a/b,'%':(a,b)=>a%b,'**':(a,b)=>a**b,
    '<':(a,b)=>a<b,'<=':(a,b)=>a<=b,'>':(a,b)=>a>b,'>=':(a,b)=>a>=b,
    '==':(a,b)=>a==b,'!=':(a,b)=>a!=b,'===':(a,b)=>a===b,'!==':(a,b)=>a!==b,
    '&':(a,b)=>a&b,'|':(a,b)=>a|b,'^':(a,b)=>a^b,'<<':(a,b)=>a<<b,'>>':(a,b)=>a>>b,'>>>':(a,b)=>a>>>b
  };
  const functions={min:[Math.min,1,32],max:[Math.max,1,32],abs:[Math.abs,1,1],floor:[Math.floor,1,1],ceil:[Math.ceil,1,1],round:[Math.round,1,1],sqrt:[Math.sqrt,1,1],pow:[Math.pow,2,2]};
  function compile(text){
    if(typeof text!=='string'||!text.trim()||text.length>8192)throw Error('表达式需有 1–8192 个字符');
    const source=text.replace(/[（]/g,'(').replace(/[）]/g,')').replace(/^\s*(?:下一状态|next)\s*=(?!=)\s*/,'');
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
          if(!Object.hasOwn(variables,node.name))throw Error('未知变量「'+node.name+'」，可使用中心、八方向、邻居数或邻居和');
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
          if(node.callee.type!=='Identifier'||!Object.hasOwn(functions,node.callee.name))throw Error('只支持 min/max/abs/floor/ceil/round/sqrt/pow 函数');
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
