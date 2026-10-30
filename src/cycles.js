/* Exact whole-board recurrence detection; fingerprints only select candidates. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.CellCycles=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const equal=(a,b)=>a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
  function fingerprint(state){let hash=2166136261;for(const word of new Uint32Array(state.buffer,state.byteOffset,state.length*2))hash=Math.imul(hash^(word^(word>>>16)),16777619);return (hash^(hash>>>16))>>>0;}
  class Tracker {
    constructor({maxBytes=8*1024*1024,maxSnapshots=128,fingerprint:hash=fingerprint,advance=null,maxFingerprints=65536,maxReplaySteps=512}={}){this.maxBytes=maxBytes;this.maxSnapshots=maxSnapshots;this.hash=hash;this.advance=advance;this.maxFingerprints=maxFingerprints;this.maxReplaySteps=maxReplaySteps;}
    reset(grid,generation,enabled=true){
      this.enabled=enabled;this.period=null;this.generation=generation;this.power=1;this.distance=0;this.recent=[];this.buckets=new Map();this.anchor=null;
      this.start=generation;this.checkpoints=[];this.stride=1;this.records=[];this.recordCursor=0;this.fingerprints=new Map();
      this.limit=Math.max(0,Math.min(this.maxSnapshots,Math.floor(this.maxBytes/Math.max(8,grid.length*8))));
      if(enabled){this.anchor=Float64Array.from(grid);const key=this.hash(this.anchor);this.remember(this.anchor.slice(),generation,key);this.rememberHistory(this.anchor,generation,key);}
    }
    remember(state,generation,key){
      if(!this.limit)return;
      const entry={state,generation,key},bucket=this.buckets.get(key)||[];bucket.push(entry);this.buckets.set(key,bucket);this.recent.push(entry);
      if(this.recent.length>this.limit){const old=this.recent.shift(),items=this.buckets.get(old.key);items.splice(items.indexOf(old),1);if(!items.length)this.buckets.delete(old.key);}
    }
    rememberHistory(state,generation,key){
      if(!this.advance)return;
      if(this.maxFingerprints>0){
        const entry={generation,key};
        if(this.records.length<this.maxFingerprints)this.records.push(entry);
        else{const old=this.records[this.recordCursor];if(this.fingerprints.get(old.key)===old)this.fingerprints.delete(old.key);this.records[this.recordCursor]=entry;this.recordCursor=(this.recordCursor+1)%this.maxFingerprints;}
        this.fingerprints.set(key,entry);
      }
      const offset=generation-this.start;
      if(!this.limit||offset%this.stride)return;
      while(this.checkpoints.length>=this.limit){this.stride*=2;this.checkpoints=this.checkpoints.filter(p=>(p.generation-this.start)%this.stride===0);if(offset%this.stride)return;}
      this.checkpoints.push({generation,state:state.slice()});
    }
    replayMatches(entry,current){
      if(!this.advance||!entry)return false;
      let checkpoint;
      for(let i=this.checkpoints.length-1;i>=0;i--)if(this.checkpoints[i].generation<=entry.generation){checkpoint=this.checkpoints[i];break;}
      if(!checkpoint||entry.generation-checkpoint.generation>this.maxReplaySteps)return false;
      // A fingerprint is only a hint. Reconstruct and compare the actual old board.
      try{let state=checkpoint.state.slice();for(let g=checkpoint.generation;g<entry.generation;g++)state=this.advance(state);return equal(current,state);}catch{return false;}
    }
    observe(grid,generation){
      if(!this.enabled)return null;
      if(generation!==this.generation+1||grid.length!==this.anchor.length){this.reset(grid,generation);return null;}
      this.generation=generation;
      if(this.period!==null)return this.period;
      const state=Float64Array.from(grid),key=this.hash(state),bucket=this.buckets.get(key)||[];
      for(const entry of bucket){if(equal(state,entry.state)){this.period=generation-entry.generation;break;}}
      if(this.period===null){const old=this.fingerprints.get(key);if(this.replayMatches(old,state))this.period=generation-old.generation;}
      // Brent's exponentially spaced anchor also covers periods beyond the cache.
      this.distance++;
      if(this.period===null&&equal(state,this.anchor))this.period=this.distance;
      if(this.period!==null){this.recent=[];this.buckets.clear();this.records=[];this.fingerprints.clear();this.checkpoints=[];return this.period;}
      if(this.distance===this.power){this.anchor=state.slice();this.power*=2;this.distance=0;}
      this.remember(state,generation,key);this.rememberHistory(state,generation,key);return null;
    }
  }
  return {Tracker};
});
