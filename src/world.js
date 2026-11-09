(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else root.CellWorld = factory(root.CellCore);
})(globalThis, function (Core) {
  'use strict';

  const maxRuns = 1000000;
  const maxCoordinate = Math.floor(Number.MAX_SAFE_INTEGER / 4);
  const validCoordinate = value => Number.isSafeInteger(value) && Math.abs(value) <= maxCoordinate;
  const validState = (rule, value) => rule.format === 'expression'
    ? Number.isFinite(value)
    : Number.isInteger(value) && value >= 0 && value < rule.count;
  const displayCount = value => value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value;
  const emptyRow = [];
  const neighborOffsets = [[0, 0], ...Core.DIRECTIONS];

  function requireDeterministic(rule) {
    if (!rule.deterministic) throw Error('随机演化规则请在有限棋盘上运行。');
  }

  // Each row stores sorted [start, endExclusive, state] runs.
  function append(row, start, end, value) {
    const previous = row.at(-1);
    if (previous?.[1] === start && Object.is(previous[2], value)) previous[1] = end;
    else row.push([start, end, value]);
  }

  function firstEndingAfter(row, x) {
    let low = 0, high = row.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (row[middle][1] <= x) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  function population(row) {
    return row.reduce((total, [start, end]) => total + end - start, 0);
  }

  // A span can be evaluated once: none of its input states changes before the next edge.
  function sweep(rows, shifts, backgrounds, visit) {
    const values = [...backgrounds], indices = rows.map(() => 0), active = rows.map(() => false);
    const edges = rows.map((row, index) => row.length ? row[0][0] + shifts[index] : Infinity);
    let start = Math.min(...edges);
    while (start !== Infinity) {
      let end = Infinity;
      for (let i = 0; i < rows.length; i++) {
        while (edges[i] === start) {
          if (active[i]) { values[i] = backgrounds[i]; indices[i]++; }
          else values[i] = rows[i][indices[i]][2];
          active[i] = !active[i];
          const run = rows[i][indices[i]];
          edges[i] = run ? run[active[i] ? 1 : 0] + shifts[i] : Infinity;
        }
        end = Math.min(end, edges[i]);
      }
      if (end === Infinity) break;
      visit(start, end, values);
      start = end;
    }
  }

  function validateRange(x, y, length) {
    if (!validCoordinate(x) || !validCoordinate(y) || !Number.isSafeInteger(length) || length < 1 || !validCoordinate(x + length - 1)) {
      throw Error('坐标或区段长度超出可精确计算的范围。');
    }
  }

  class SparseBoard {
    constructor(background = 0) {
      this.background = background;
      this.rows = new Map();
      this.runCount = 0;
      this.population = 0n;
    }

    get size() { return displayCount(this.population); }

    get(x, y) {
      const row = this.rows.get(y);
      if (!row) return this.background;
      const run = row[firstEndingAfter(row, x)];
      return run && run[0] <= x ? run[2] : this.background;
    }

    replaceRow(y, row) {
      const old = this.rows.get(y) ?? emptyRow;
      const count = this.runCount + row.length - old.length;
      if (count > maxRuns) throw Error('图案区段超过 100 万。请把图案分开运行。');
      if (row.length) {
        validateRange(row[0][0], y, row.at(-1)[1] - row[0][0]);
        this.rows.set(y, row);
      } else this.rows.delete(y);
      this.runCount = count;
      this.population += BigInt(population(row)) - BigInt(population(old));
    }

    paintRow(y, updates) {
      const background = this.background, current = this.rows.get(y) ?? emptyRow, row = [];
      if (!current.length) {
        for (const [start, end, value] of updates) if (!Object.is(value, background)) append(row, start, end, value);
      } else {
        sweep([current, updates], [0, 0], [background, undefined], (start, end, [old, paint]) => {
          const value = paint ?? old;
          if (!Object.is(value, background)) append(row, start, end, value);
        });
      }
      this.replaceRow(y, row);
    }

    set(x, y, value) {
      validateRange(x, y, 1);
      if (!Object.is(this.get(x, y), value)) this.paintRow(y, [[x, x + 1, value]]);
    }

    overlay(records) {
      const updates = new Map();
      for (const [x, y, length, value] of records) {
        validateRange(x, y, length);
        let row = updates.get(y);
        if (!row) { row = []; updates.set(y, row); }
        row.push([x, x + length, value]);
      }
      for (const row of updates.values()) {
        row.sort((a, b) => a[0] - b[0]);
        for (let i = 1; i < row.length; i++) if (row[i - 1][1] > row[i][0]) throw Error('图案或存档含重复、重叠的坐标。');
      }
      for (const [y, row] of updates) this.paintRow(y, row);
    }

    *runs(left = -Infinity, top = -Infinity, right = Infinity, bottom = Infinity) {
      for (const [y, row] of this.rows) {
        if (y < top || y >= bottom) continue;
        for (let i = firstEndingAfter(row, left); i < row.length && row[i][0] < right; i++) {
          const [start, end, value] = row[i];
          yield [Math.max(start, left), y, Math.min(end, right), value];
        }
      }
    }

    copy() {
      const board = new SparseBoard(this.background);
      board.rows = new Map(this.rows);
      board.runCount = this.runCount;
      board.population = this.population;
      return board;
    }

    mapValues(transform) {
      const board = new SparseBoard(transform(this.background));
      for (const [y, current] of this.rows) {
        const row = [];
        for (const [start, end, old] of current) {
          const value = transform(old);
          if (!Object.is(value, board.background)) append(row, start, end, value);
        }
        board.replaceRow(y, row);
      }
      return board;
    }

    bounds() {
      if (!this.runCount) return null;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [y, row] of this.rows) {
        minX = Math.min(minX, row[0][0]); maxX = Math.max(maxX, row.at(-1)[1] - 1);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
      return { minX, minY, maxX, maxY };
    }

    signature() {
      const state = new Float64Array(1 + 4 * this.runCount);
      state[0] = this.background;
      let index = 1;
      for (const y of [...this.rows.keys()].sort((a, b) => a - b)) {
        for (const [start, end, value] of this.rows.get(y)) {
          state[index++] = start;
          state[index++] = y;
          state[index++] = end - start;
          state[index++] = value;
        }
      }
      return state;
    }
  }

  function fromDense(grid, width) {
    const board = new SparseBoard();
    for (let start = 0; start < grid.length; start += width) {
      const row = [];
      for (let x = 0; x < width; x++) if (!Object.is(grid[start + x], 0)) append(row, x, x + 1, grid[start + x]);
      board.replaceRow(start / width, row);
    }
    return board;
  }

  function toDense(board, width, height) {
    Core.validateDimensions(width, height);
    const grid = Array(width * height).fill(board.background);
    for (const [start, y, end, value] of board.runs(0, 0, width, height)) grid.fill(value, y * width + start, y * width + end);
    return { grid, width, height };
  }

  function step(board, rule) {
    requireDeterministic(rule);
    const backgrounds = Array(9).fill(board.background);
    const next = new SparseBoard(Core.transition(rule, backgrounds));
    const candidates = new Set();
    for (const y of board.rows.keys()) { candidates.add(y - 1); candidates.add(y); candidates.add(y + 1); }
    const shifts = neighborOffsets.map(([dx]) => -dx);
    for (const y of candidates) {
      const rows = neighborOffsets.map(([, dy]) => board.rows.get(y + dy) ?? emptyRow), result = [];
      sweep(rows, shifts, backgrounds, (start, end, neighbors) => {
        const value = Core.transition(rule, neighbors);
        if (!Object.is(value, next.background)) append(result, start, end, value);
      });
      if (result.length) next.replaceRow(y, result);
    }
    return next;
  }

  function decodeSave(raw) {
    if (raw?.version !== 2 && raw?.version !== 3) return { save: Core.validateSave(raw), board: null };
    const { width, height, generation, boundary, focus, cellSize } = raw;
    const background = raw.background === '-0' ? -0 : raw.background;
    Core.validateDimensions(width, height);
    if (raw.world !== 'infinite' || !Number.isSafeInteger(generation) || generation < 0 || !['wrap', 'zero'].includes(boundary)) throw Error('无限棋盘存档无效。');
    const rule = Core.compile(raw.rule);
    requireDeterministic(rule);
    const legacy = raw.version === 2, records = legacy ? raw.cells : raw.runs;
    if (!validState(rule, background) || !Array.isArray(records) || records.length > maxRuns) throw Error('无限棋盘的背景或区段数无效。');
    const board = new SparseBoard(background);
    board.overlay(records.map(record => {
      if (!Array.isArray(record) || record.length !== (legacy ? 3 : 4)) throw Error('无限棋盘元胞记录无效。');
      const [x, y] = record, state = record.at(-1), value = state === '-0' ? -0 : state;
      if (!validState(rule, value) || Object.is(value, background)) throw Error('无限棋盘元胞记录无效。');
      return [x, y, legacy ? 1 : record[2], value];
    }));
    if (focus !== undefined && (!Array.isArray(focus) || focus.length !== 2 || !focus.every(validCoordinate))) throw Error('存档视野坐标无效。');
    if (cellSize !== undefined && (!Number.isFinite(cellSize) || cellSize <= 0 || cellSize > 120.000001)) throw Error('存档视野缩放无效。');
    return { save: { width, height, generation, boundary, rule: Core.ruleSpec(rule), focus, cellSize }, board };
  }

  function encodeBoard(board) {
    const state = value => Object.is(value, -0) ? '-0' : value;
    return { background: state(board.background), runs: Array.from(board.runs(), ([x, y, end, value]) => [x, y, end - x, state(value)]) };
  }

  return { SparseBoard, maxRuns, maxCoordinate, validCoordinate, validState, requireDeterministic, displayCount, fromDense, toDense, step, decodeSave, encodeBoard };
});
