(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CellPresets=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // Preserve the player's fully expanded A-I formula.
  const wireworld='((E-1)==0)*2+((E-2)==0)*3+((E-3)==0)*((((A==1)+(B==1)+(C==1)+(D==1)+(F==1)+(G==1)+(H==1)+(I==1)==1)||((A==1)+(B==1)+(C==1)+(D==1)+(F==1)+(G==1)+(H==1)+(I==1)==2))*1+(1-(((A==1)+(B==1)+(C==1)+(D==1)+(F==1)+(G==1)+(H==1)+(I==1)==1)||((A==1)+(B==1)+(C==1)+(D==1)+(F==1)+(G==1)+(H==1)+(I==1)==2)))*3)';
  const names=['空白','电子头','电子尾','导线'],colors=['#1a2d22','#77bdf0','#e88f79','#e8c86b'];
  function isWireworld(rule){return rule.format==='expression'&&rule.text.trim()===wireworld;}
  function wireworldDemo(){
    const width=48,height=28,grid=Array(width*height).fill(0),path=[];
    for(let x=12;x<=34;x++)path.push([x,5]);
    for(let i=1;i<=3;i++)path.push([34+i,5+i]);
    for(let y=9;y<=18;y++)path.push([37,y]);
    for(let i=1;i<=3;i++)path.push([37-i,18+i]);
    for(let x=33;x>=12;x--)path.push([x,21]);
    for(let i=1;i<=3;i++)path.push([12-i,21-i]);
    for(let y=17;y>=8;y--)path.push([9,y]);
    for(let i=1;i<=2;i++)path.push([9+i,8-i]);
    for(const [x,y] of path)grid[y*width+x]=3;
    grid[5*width+19]=2;grid[5*width+20]=1;
    return {version:1,width,height,generation:0,boundary:'zero',rule:{format:'expression',text:wireworld},grid};
  }
  return {wireworld,wireworldDemo,isWireworld,names,colors};
});
