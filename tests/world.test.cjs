const { test } = require('node:test');
const assert = require('node:assert/strict');
const { gzipSync } = require('node:zlib');
const Core = require('../src/core.js');
const World = require('../src/world.js');
const Pattern = require('../src/pattern.js');
const { Tracker } = require('../src/cycles.js');

const life = Core.compile({ format: 'bs', text: 'B3/S23' });

test('compressed RLE decodes locally, preserves coordinates, and rejects corrupt and oversized output', async () => {
  const text='#CXRLE Pos=-8,9\nx=3,y=1\n3o!';
  const compressed=gzipSync(text);
  const decoded=await Pattern.readFile(new Blob([compressed]));
  assert.deepEqual(Pattern.readRle(decoded),Pattern.readRle(text));
  assert.equal(await Pattern.readFile(new Blob([text])),text);
  assert.throws(()=>Pattern.readRle(compressed.toString('utf8')), /选择原始 \.rle\.gz/);
  await assert.rejects(Pattern.readFile(new Blob([compressed.subarray(0,-5)])), /无法解压/);
  const tooLarge=gzipSync(Buffer.alloc(Pattern.maxBytes+1,65));
  await assert.rejects(Pattern.readFile(new Blob([tooLarge])), /解压后的图案超过/);
});

test('Macrocell uses Golly absolute coordinates for shared binary and multistate nodes', async () => {
  const source='[M2] (golly 5.0)\n#R B3/S23\n**$.*$\n4 1 0 0 1';
  const pattern=Pattern.readPattern(await Pattern.readFile(new Blob([gzipSync(source)])));
  assert.equal(pattern.rule,'B3/S23');
  assert.deepEqual(pattern.position,[-8,-7]);
  assert.equal(pattern.board.size,6);
  assert.deepEqual(World.encodeBoard(pattern.board).runs,[[-8,-7,2,1],[-7,-6,1,1],[0,1,2,1],[1,2,1,1]]);
  const multi=Pattern.readPattern('[M2]\n#R WireWorld\n1 0 2 3 1\n2 1 0 0 1');
  assert.equal(multi.maxState,3);
  assert.equal(multi.board.get(-1,-1),2);
  assert.equal(multi.board.get(0,2),3);
  const moved=new World.SparseBoard();moved.overlayBoard(multi.board,7,-9);
  assert.equal(moved.get(6,-10),2);
  assert.equal(multi.board.get(-1,-1),2);
  assert.throws(()=>Pattern.readPattern('[M2]\n4 1 0 0 0'),/子节点/);
  assert.throws(()=>Pattern.readPattern('[M2]\n*********'),/叶节点超出/);
});

test('a glider steps across negative coordinates without wrapping or allocating the intervening space', () => {
  const glider = Pattern.readRle('x = 3, y = 3, rule = B3/S23\nbo$2bo$3o!');
  let board = new World.SparseBoard();
  board.overlay(glider.runs.map(([x,y,length,value])=>[x-1000000000,y-1000000000,length,value]));
  for (const x of [1000000000,1000000001]) for (const y of [1000000000,1000000001]) board.set(x,y,1);
  const tracker = new Tracker({ variableLength:true });
  tracker.reset(board.signature(),0);
  for (let generation=1;generation<=4;generation++) {
    board=World.step(board,life);
    tracker.observe(board.signature(),generation);
  }
  assert.equal(board.size,9);
  for (const [x,y,length] of glider.runs) for (let i=0;i<length;i++) assert.equal(board.get(x+i-999999999,y-999999999),1);
  assert.equal(board.get(1000000001,1000000001),1);
  assert.equal(tracker.period,null);
});

test('infinite B0 rules update the uniform background even when there are no exceptions', () => {
  const rule = Core.compile({ format:'bs',text:'B0/S' });
  let board = World.step(new World.SparseBoard(),rule);
  assert.equal(board.background,1);
  assert.equal(board.get(-200000000, 200000000),1);
  assert.equal(board.size,0);
  board=World.step(board,rule);
  assert.equal(board.background,0);
  assert.equal(board.size,0);
});

test('a pulsar repeats on the infinite board even though its population changes', () => {
  let board = new World.SparseBoard();
  for (const row of [-6,-1,1,6]) for (const column of [-4,-3,-2,2,3,4]) {
    board.set(column,row,1);board.set(row,column,1);
  }
  const tracker = new Tracker({ variableLength:true });
  tracker.reset(board.signature(),0);
  const initial = board.size;
  board=World.step(board,life);
  assert.notEqual(board.size,initial);
  tracker.observe(board.signature(),1);
  for (let i=2;i<=3;i++) { board=World.step(board,life);tracker.observe(board.signature(),i); }
  assert.equal(tracker.period,3);
});

test('infinite saves keep signed zero, coordinates, and old finite save compatibility', () => {
  const board=new World.SparseBoard();board.set(-5,40000,-0);board.set(8,-4,2);
  const save={version:3,world:'infinite',width:72,height:48,boundary:'zero',generation:2,rule:{format:'expression',text:'E'},focus:[-5,40000],...World.encodeBoard(board)};
  const restored=World.decodeSave(JSON.parse(JSON.stringify(save)));
  assert.deepEqual(restored.board.signature(),board.signature());
  assert.deepEqual(restored.save.focus,[-5,40000]);
  assert.throws(()=>World.decodeSave({...save,runs:[...save.runs,save.runs[0]]}),/重叠/);
  const old=World.decodeSave({...save,version:2,cells:[[-5,40000,'-0'],[8,-4,2]]});
  assert.deepEqual(old.board.signature(),board.signature());
  assert.throws(()=>World.step(board,Core.compile({format:'expression',text:'random([0,1])'})),/随机/);
  assert.equal(World.decodeSave({version:1,width:3,height:3,boundary:'wrap',generation:0,grid:Array(9).fill(0),rule:Core.ruleSpec(life)}).board,null);
});

test('extended RLE retains signed positions and state IDs without expanding blank runs', () => {
  const input='#N Circuit\n#CXRLE Pos=-120,450 Gen=32\nx = 5, y = 4, rule = WireWorld\nA.BpAyO3$4bo!\n@RULE WireWorld\n@TABLE';
  const pattern=Pattern.readRle(input);
  assert.deepEqual(pattern.position,[-120,450]);
  assert.equal(pattern.rule,'WireWorld');
  assert.deepEqual(pattern.runs,[[0,0,1,1],[2,0,1,2],[3,0,1,25],[4,0,1,255],[4,3,1,1]]);
  assert.deepEqual(Pattern.readRle('1000000000bo!').runs,[[1000000000,0,1,1]]);
  assert.deepEqual(Pattern.readRle('100001oo!').runs,[[0,0,100002,1]]);
  for(const text of ['2 o!','0o!','o!o','yP!','10000000000000000$o!'])assert.throws(()=>Pattern.readRle(text));
});

test('ten million live cells import, evolve and save as short row runs', () => {
  const pattern=Pattern.readRle('x=1000000,y=10\n'+Array(10).fill('1000000o').join('$')+'!');
  const board=new World.SparseBoard();board.overlay(pattern.runs);
  assert.equal(board.size,10000000);
  assert.equal(board.runCount,10);
  const next=World.step(board,life);
  assert.equal(next.size,2000016);
  assert.equal(next.get(500000,-1),1);
  assert.equal(next.get(500000,0),0);
  assert.equal(next.get(-1,3),1);
  assert.equal(next.get(-1,-1),0);
  assert.ok(JSON.stringify(World.encodeBoard(next)).length<1000);
  const duplicate=board.copy();duplicate.set(500000,4,0);
  assert.equal(board.get(500000,4),1);
  assert.equal(duplicate.size,9999999);
  assert.equal(duplicate.get(500001,4),1);
});

test('interval evolution agrees with cellwise evolution for asymmetric and changing-background rules', () => {
  const width=25,height=23;
  const rules=[life,Core.compile({format:'bs',text:'B0/S2'}),Core.compile({format:'expression',text:'(A + 2*F + E) % 3'})];
  for(const rule of rules){
    const initial=Array(width*height).fill(0);
    let rng=12345;
    for(let y=6;y<17;y++)for(let x=6;x<19;x++){
      rng=(Math.imul(rng,1664525)+1013904223)>>>0;
      initial[y*width+x]=(rng>>>28)%(rule.format==='expression'?3:2);
    }
    let board=World.fromDense(initial,width),dense=initial;
    for(let i=0;i<5;i++){
      dense=Core.step(dense,width,height,rule,'wrap');
      board=World.step(board,rule);
      assert.deepEqual(World.toDense(board,width,height).grid,dense);
    }
  }
});
