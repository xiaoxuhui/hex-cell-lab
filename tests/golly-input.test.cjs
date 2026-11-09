const { test } = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../src/core.js');
const Golly = require('../src/golly.js');
const Input = require('../src/golly-input.js');
const Redstone = require('../src/redstone.js');

const read = text => Core.compile(Input.sourceSpec(text));
const table = (symmetry, rows) => `@RULE Test\n@TABLE\nn_states:3\nneighborhood:vonNeumann\nsymmetries:${symmetry}\n${rows}`;
const fourTree = `@RULE CopyWest
@TREE
num_states=2
num_neighbors=4
num_nodes=8
1 0 0
1 1 1
2 0 0
2 1 1
3 2 2
3 3 3
4 4 5
5 6 6`;

test('ordinary Golly strings load as editable B/S or SBC, up to 256 Generations states', async () => {
  assert.deepEqual(Input.sourceSpec('23/3'), { format: 'bs', text: 'B3/S23' });
  assert.deepEqual(Input.sourceSpec(' 345/2/4 '), { format: 'sbc', text: 'S345/B2/C4' });
  const rule = read('23/3/256');
  assert.equal(rule.count, 256);
  assert.equal(Core.transition(rule, [254,0,0,0,0,0,0,0,0]), 255);
  assert.equal((await Golly.convert(rule)).text, '23/3/256');
  assert.throws(() => read('23/3/257'), /状态数/);
});

test('table import preserves variable binding, alias order, first match and fallback', () => {
  const rule = read(table('none', 'var a={2,1}\nvar b={a,0}\nvar c=b\n0,a,c,0,a,a\n0,b,b,0,b,2\n@NAMES\n2 红石输出'));
  assert.equal(Core.transition(rule, [0,1,0,2,0,0,0,1,0]), 1);
  assert.equal(Core.transition(rule, [0,1,0,1,0,0,0,1,0]), 1);
  assert.equal(Core.transition(rule, [0,2,0,2,0,0,0,2,0]), 2);
  assert.equal(Core.transition(rule, [0,1,0,1,0,0,0,0,0]), 0);
  assert.equal(Core.transition(rule, [2,0,0,0,0,0,0,0,0]), 2);
  assert.equal(rule.labels[2], '红石输出');
});

test('rotation, reflection and permutation match the declared neighborhood', () => {
  const diagonalPair = [0,0,1,0,0,0,0,0,0];
  const moore = symmetry => read(`@RULE Corners\n@TABLE\nn_states:2\nneighborhood:Moore\nsymmetries:${symmetry}\n0100000001`);
  assert.equal(Core.transition(moore('rotate4'), diagonalPair), 0);
  assert.equal(Core.transition(moore('rotate8'), diagonalPair), 1);
  const mirror = read(table('reflect_horizontal', '0,0,1,0,0,2'));
  assert.equal(Core.transition(mirror, [0,0,0,0,0,0,0,1,0]), 2);
  const permute = read(table('permute', 'var a={2,1}\nvar b={2,1}\n0,a,a,b,b,a'));
  assert.equal(Core.transition(permute, [0,1,0,2,0,1,0,2,0]), 1);
  assert.equal(Core.transition(permute, [0,1,0,2,0,1,0,1,0]), 0);
});

test('four-neighbor tree uses Golly north, west, east, south, center order', () => {
  const rule = read(fourTree);
  assert.equal(Core.transition(rule, [0,0,0,0,0,0,0,1,0]), 1);
  assert.equal(Core.transition(rule, [0,1,1,1,1,1,1,0,1]), 0);
  assert.throws(() => read(fourTree.replace('4 4 5', '4 4 6')), /规则树节点/);
});

test('exports of redstone, rule trees and permuted B0 tables round-trip into the simulator', async () => {
  const demo = Redstone.demo();
  const originals = [
    [demo.rule, demo.grid, demo.width, demo.height],
    [{ format:'expression', text:'(A + 2*B + E + I) % 3' }, [0,1,2,2,0,1,1,0,2], 3, 3, 3],
    [{ format:'sbc', text:'S23/B02/C3' }, [0,1,2,2,0,1,1,0,2], 3, 3]
  ];
  for (const [spec, initial, width, height, stateCount] of originals) {
    const original = Core.compile(spec), exported = await Golly.convert(original, { stateCount });
    const imported = read('\uFEFF' + exported.text.replace(/\n/g, '\r\n'));
    assert.equal((await Golly.convert(imported)).filename, exported.filename);
    let grid = initial;
    for (let tick = 0; tick < 18; tick++) {
      const next = Core.step(grid,width,height,original,'wrap');
      assert.deepEqual(Core.step(grid,width,height,imported,'wrap'),next);
      grid = next;
    }
    const saved = Core.validateSave({ version:1,width,height,boundary:'wrap',generation:18,grid,rule:Core.ruleSpec(imported) });
    assert.equal(Core.compile(saved.rule).name, imported.name);
  }
});

test('unsupported rules and malformed input are rejected with a useful error', () => {
  assert.throws(() => read('x = 3, y = 3, rule = B3/S23\nbo$2bo$3o!'), /@RULE/);
  assert.throws(() => read('@RULE IconOnly\n@COLORS\n1 20 20 20'), /@TABLE 或 @TREE/);
  assert.throws(() => read(table('none','0,0,0,0,0,9')), /状态 9/);
  assert.throws(() => read(table('none','0,0,0,0,0,1').replace('vonNeumann','hexagonal')), /邻域/);
});
