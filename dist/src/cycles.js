/* Exact whole-board recurrence detection; fingerprints only select candidates. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.CellCycles=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const equal=(a,b)=>a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
  function fingerprint(state){let hash=2166136261;for(const word of new Uint32Array(state.buffer,state.byteOffset,state.length*2))hash=Math.imul(hash^word,16777619);return hash>>>0;}
  class Tracker {
    constructor({maxBytes=8*1024*1024,maxSnapshots=128,fingerprint:hash=fingerprint}={}){this.maxBytes=maxBytes;this.maxSnapshots=maxSnapshots;this.hash=hash;}
    reset(grid,generation,enabled=true){
      this.enabled=enabled;this.period=null;this.generation=generation;this.power=1;this.distance=0;this.recent=[];this.buckets=new Map();this.anchor=null;
      this.limit=Math.max(0,Math.min(this.maxSnapshots,Math.floor(this.maxBytes/Math.max(8,grid.length*8))));
      if(enabled){this.anchor=Float64Array.from(grid);this.remember(this.anchor.slice(),generation,this.hash(this.anchor));}
    }
    remember(state,generation,key){
      if(!this.limit)return;
      const entry={state,generation,key},bucket=this.buckets.get(key)||[];bucket.push(entry);this.buckets.set(key,bucket);this.recent.push(entry);
      if(this.recent.length>this.limit){const old=this.recent.shift(),items=this.buckets.get(old.key);items.splice(items.indexOf(old),1);if(!items.length)this.buckets.delete(old.key);}
    }
    observe(grid,generation){
      if(!this.enabled)return null;
      if(generation!==this.generation+1||grid.length!==this.anchor.length){this.reset(grid,generation);return null;}
      this.generation=generation;
      if(this.period!==null)return this.period;
      const state=Float64Array.from(grid),key=this.hash(state),bucket=this.buckets.get(key)||[];
      for(const entry of bucket){if(equal(state,entry.state)){this.period=generation-entry.generation;break;}}
      // Brent's exponentially spaced anchor also covers periods beyond the cache.
      this.distance++;
      if(this.period===null&&equal(state,this.anchor))this.period=this.distance;
      if(this.period!==null){this.recent=[];this.buckets.clear();return this.period;}
      if(this.distance===this.power){this.anchor=state.slice();this.power*=2;this.distance=0;}
      this.remember(state,generation,key);return null;
    }
  }
  return {Tracker};
});
