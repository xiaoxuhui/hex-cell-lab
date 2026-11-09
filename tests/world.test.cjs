const { test } = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../src/core.js');
const World = require('../src/world.js');
const Pattern = require('../src/pattern.js');
const { Tracker } = require('../src/cycles.js');

const life = Core.compile({ format: 'bs', text: 'B3/S23' });

test('a glider steps across negative coordinates without wrapping or allocating the intervening space', () => {
  const glider = Pattern.readRle('x = 3, y = 3, rule = B3/S23\nbo$2bo$3o!');
  let board = new World.SparseBoard();
  for (const [x,y,value] of glider.cells) board.set(x-1000000000,y-1000000000,value);
  for (const x of [1000000000,1000000001]) for (const y of [1000000000,1000000001]) board.set(x,y,1);
  const tracker = new Tracker({ variableLength:true });
  tracker.reset(board.signature(),0);
  for (let generation=1;generation<=4;generation++) {
    board=World.step(board,life);
    tracker.observe(board.signature(),generation);
  }
  assert.equal(board.size,9);
  for (const [x,y] of glider.cells) assert.equal(board.get(x-999999999,y-999999999),1);
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
  const save={version:2,world:'infinite',width:72,height:48,boundary:'zero',generation:2,rule:{format:'expression',text:'E'},focus:[-5,40000],...World.encodeBoard(board)};
  const restored=World.decodeSave(JSON.parse(JSON.stringify(save)));
  assert.deepEqual(restored.board.signature(),board.signature());
  assert.deepEqual(restored.save.focus,[-5,40000]);
  assert.throws(()=>World.decodeSave({...save,cells:[...save.cells,save.cells[0]]}),/重复坐标/);
  assert.throws(()=>World.step(board,Core.compile({format:'expression',text:'random([0,1])'})),/随机/);
  assert.equal(World.decodeSave({version:1,width:3,height:3,boundary:'wrap',generation:0,grid:Array(9).fill(0),rule:Core.ruleSpec(life)}).board,null);
});

test('extended RLE retains signed positions and state IDs without expanding blank runs', () => {
  const input='#N Circuit\n#CXRLE Pos=-120,450 Gen=32\nx = 5, y = 4, rule = WireWorld\nA.BpAyO3$4bo!\n@RULE WireWorld\n@TABLE';
  const pattern=Pattern.readRle(input);
  assert.deepEqual(pattern.position,[-120,450]);
  assert.equal(pattern.rule,'WireWorld');
  assert.deepEqual(pattern.cells,[[0,0,1],[2,0,2],[3,0,25],[4,0,255],[4,3,1]]);
  assert.deepEqual(Pattern.readRle('1000000000bo!').cells,[[1000000000,0,1]]);
  for(const text of ['2 o!','0o!','o!o','yP!','100001o!','10000000000000000$o!'])assert.throws(()=>Pattern.readRle(text));
});
