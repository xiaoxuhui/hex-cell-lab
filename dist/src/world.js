(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else root.CellWorld = factory(root.CellCore);
})(globalThis, function (Core) {
  'use strict';

  const maxCells = 100000;
  const maxCoordinate = Math.floor(Number.MAX_SAFE_INTEGER / 4);
  const validCoordinate = value => Number.isSafeInteger(value) && Math.abs(value) <= maxCoordinate;
  const validState = (rule, value) => rule.format === 'expression'
    ? Number.isFinite(value)
    : Number.isInteger(value) && value >= 0 && value < rule.count;

  function requireDeterministic(rule) {
    if (!rule.deterministic) throw Error('随机演化规则请在有限棋盘上运行。');
  }

  class SparseBoard {
    constructor(background = 0) {
      this.background = background;
      this.rows = new Map();
      this.size = 0;
    }

    get(x, y) { return this.rows.get(y)?.get(x) ?? this.background; }

    set(x, y, value) {
      if (!validCoordinate(x) || !validCoordinate(y)) throw Error('坐标超出可精确计算的范围。');
      let row = this.rows.get(y);
      if (Object.is(value, this.background)) {
        if (row?.delete(x)) {
          this.size--;
          if (!row.size) this.rows.delete(y);
        }
        return;
      }
      if (!row?.has(x)) {
        if (this.size >= maxCells) throw Error('无限棋盘最多保存 10 万个与背景不同的元胞。');
        this.size++;
      }
      if (!row) { row = new Map(); this.rows.set(y, row); }
      row.set(x, value);
    }

    *entries() {
      for (const [y, row] of this.rows) for (const [x, value] of row) yield [x, y, value];
    }

    copy() {
      const board = new SparseBoard(this.background);
      for (const [x, y, value] of this.entries()) board.set(x, y, value);
      return board;
    }

    mapValues(transform) {
      const board = new SparseBoard(transform(this.background));
      for (const [x, y, value] of this.entries()) board.set(x, y, transform(value));
      return board;
    }

    bounds() {
      if (!this.size) return null;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [x, y] of this.entries()) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
      return { minX, minY, maxX, maxY };
    }

    signature() {
      const cells = [...this.entries()].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
      const state = new Float64Array(1 + 3 * cells.length);
      state[0] = this.background;
      cells.forEach((cell, index) => state.set(cell, 1 + index * 3));
      return state;
    }
  }

  function fromDense(grid, width) {
    const board = new SparseBoard();
    grid.forEach((value, index) => {
      if (!Object.is(value, 0)) board.set(index % width, Math.floor(index / width), value);
    });
    return board;
  }

  function toDense(board, width, height) {
    Core.validateDimensions(width, height);
    const grid = Array(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) grid[y * width + x] = board.get(x, y);
    return { grid, width, height };
  }

  function step(board, rule) {
    requireDeterministic(rule);
    const neighborhood = Array(9).fill(board.background);
    const next = new SparseBoard(Core.transition(rule, neighborhood));
    const candidates = new Map();
    // Away from stored cells, all nine inputs are the previous uniform background.
    for (const [y, row] of board.rows) {
      for (let yy = y - 1; yy <= y + 1; yy++) {
        let columns = candidates.get(yy);
        if (!columns) { columns = new Set(); candidates.set(yy, columns); }
        for (const x of row.keys()) { columns.add(x - 1); columns.add(x); columns.add(x + 1); }
      }
    }
    for (const [y, columns] of candidates) for (const x of columns) {
      neighborhood[0] = board.get(x, y);
      Core.DIRECTIONS.forEach(([dx, dy], index) => { neighborhood[index + 1] = board.get(x + dx, y + dy); });
      const value = Core.transition(rule, neighborhood);
      if (!Object.is(value, next.background)) next.set(x, y, value);
    }
    return next;
  }

  function decodeSave(raw) {
    if (raw?.version !== 2) return { save: Core.validateSave(raw), board: null };
    const { width, height, generation, boundary, cells, focus } = raw;
    const background = raw.background === '-0' ? -0 : raw.background;
    Core.validateDimensions(width, height);
    if (raw.world !== 'infinite' || !Number.isSafeInteger(generation) || generation < 0 || !['wrap', 'zero'].includes(boundary)) throw Error('无限棋盘存档无效。');
    const rule = Core.compile(raw.rule);
    requireDeterministic(rule);
    if (!validState(rule, background) || !Array.isArray(cells) || cells.length > maxCells) throw Error('无限棋盘的背景或元胞数无效。');
    const board = new SparseBoard(background);
    for (const cell of cells) {
      if (!Array.isArray(cell) || cell.length !== 3) throw Error('无限棋盘元胞记录无效。');
      const [x, y, state] = cell, value = state === '-0' ? -0 : state;
      if (!validState(rule, value) || Object.is(value, background)) throw Error('无限棋盘元胞记录无效。');
      if (board.rows.get(y)?.has(x)) throw Error('存档含重复坐标。');
      board.set(x, y, value);
    }
    if (focus !== undefined && (!Array.isArray(focus) || focus.length !== 2 || !focus.every(validCoordinate))) throw Error('存档视野坐标无效。');
    return { save: { width, height, generation, boundary, rule: Core.ruleSpec(rule), focus }, board };
  }

  function encodeBoard(board) {
    const state = value => Object.is(value, -0) ? '-0' : value;
    return { background: state(board.background), cells: Array.from(board.entries(), ([x, y, value]) => [x, y, state(value)]) };
  }

  return { SparseBoard, maxCells, maxCoordinate, validCoordinate, validState, requireDeterministic, fromDense, toDense, step, decodeSave, encodeBoard };
});
