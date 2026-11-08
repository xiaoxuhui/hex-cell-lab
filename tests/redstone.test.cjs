const { test } = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../src/core.js');
const Redstone = require('../src/redstone.js');
const Golly = require('../src/golly.js');

const rule = Core.compile({ format: 'expression', text: Redstone.formula });
const strength = value => Redstone.parts[value].strength;

test('redstone block feeds only cardinal neighbors and 15 consecutive dust cells', () => {
  const width = 19, height = 3;
  let grid = Array(width * height).fill(0);
  grid[width + 1] = Redstone.block;
  grid.fill(Redstone.dust, width + 2, width * 2);
  grid[2] = Redstone.dust;
  const step = () => { grid = Core.step(grid, width, height, rule, 'zero'); };
  step();
  assert.equal(strength(grid[2]), 0, 'diagonal cell receives no direct power');
  assert.equal(strength(grid[width + 2]), 15);
  assert.equal(strength(grid[width + 3]), 0);
  for (let tick = 1; tick < 18; tick++) step();
  assert.deepEqual(grid.slice(width + 2, width * 2).map(strength), [...Array.from({ length: 15 }, (_, i) => 15 - i), 0, 0]);
  grid[width + 1] = 0;
  for (let tick = 0; tick < 16; tick++) step();
  assert.ok(grid.slice(width + 2, width * 2).every(value => value === Redstone.dust));
});

test('torch inverts its rear input and never feeds that side', () => {
  for (let direction = 0; direction < 4; direction++) {
    const rear = (direction + 2) % 4;
    const inputs = [0, 0, 0, 0];
    inputs[rear] = Redstone.block;
    assert.equal(strength(Redstone.transition(Redstone.torch(direction), ...inputs)), 0);
    inputs[rear] = 0;
    inputs[direction] = Redstone.block;
    const lit = Redstone.transition(Redstone.torch(direction, false), ...inputs);
    assert.equal(strength(lit), 15);
    assert.equal(Redstone.signal(lit, rear), 0);
  }
});

test('repeaters ignore front power and restore a weak rear signal after the selected delay', () => {
  for (let direction = 0; direction < 4; direction++) {
    for (let delay = 1; delay <= 4; delay++) {
      const neighbors = [0, 0, 0, 0];
      const idle = Redstone.repeater(direction, delay);
      neighbors[direction] = Redstone.block;
      assert.equal(Redstone.transition(idle, ...neighbors), idle);
      neighbors[(direction + 2) % 4] = Redstone.dust + 1;
      let value = idle;
      for (let tick = 1; tick <= delay; tick++) {
        value = Redstone.transition(value, ...neighbors);
        assert.equal(strength(value), tick === delay ? 15 : 0);
      }
      assert.deepEqual([0, 1, 2, 3].map(side => Redstone.signal(value, side)), [0, 1, 2, 3].map(side => side === direction ? 15 : 0));
    }
  }
});

test('a one-generation pulse stays on for the configured repeater delay', () => {
  let value = Redstone.repeater(1, 4);
  const samples = [];
  for (let tick = 1; tick <= 8; tick++) {
    value = Redstone.transition(value, 0, 0, 0, tick === 1 ? Redstone.block : 0);
    samples.push(strength(value));
  }
  assert.deepEqual(samples, [0, 0, 0, 15, 15, 15, 15, 0]);
});

test('the full redstone preset exports directly as a four-neighbor Golly rule', async () => {
  const output = await Golly.convert(rule);
  assert.equal(output.algorithm, 'RuleLoader');
  assert.match(output.text, /n_states:154\nneighborhood:vonNeumann/);
  assert.match(output.text, /@NAMES\n0 空白\n1 红石粉 · 强度 0/);
  assert.equal(output.filename, output.ruleName + '.rule');
});
