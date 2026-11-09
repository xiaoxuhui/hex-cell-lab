(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./world.js'));
  else root.CellPattern = factory(root.CellWorld);
})(globalThis, function (World) {
  'use strict';

  const maxBytes = 16 * 1024 * 1024;

  async function readFile(file) {
    if (file.size > maxBytes) throw Error('图案文件需在 16 MiB 以内。');
    const header = new Uint8Array(await file.slice(0, 3).arrayBuffer());
    const gzip = header[0] === 0x1f && header[1] === 0x8b && header[2] === 8;
    if (!gzip) {
      if (/\.gz$/i.test(file.name ?? '')) throw Error('这个文件没有有效的 gzip 文件头。请选择原始压缩文件。');
      return file.text();
    }
    if (typeof DecompressionStream !== 'function') throw Error('此浏览器无法解压 gzip，请先解压为 .rle 或 .mc 文件再选择。');
    const reader = file.stream().pipeThrough(new DecompressionStream('gzip')).getReader();
    const decoder = new TextDecoder(), chunks = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read().catch(() => { throw Error('gzip 图案无法解压，请检查原始文件是否完整。'); });
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel().catch(() => {});
          throw Error('解压后的图案超过 16 MiB。');
        }
        chunks.push(decoder.decode(value, { stream: true }));
      }
      chunks.push(decoder.decode());
      return chunks.join('');
    } finally {
      reader.releaseLock();
    }
  }

  function checkedLines(text) {
    if (typeof text !== 'string' || !text.trim()) throw Error('请粘贴图案文本或选择图案文件。');
    if (/^\u001f[\u008b\ufffd]\u0008/.test(text.trimStart())) throw Error('这段内容是 gzip 压缩数据。请直接选择原始 .rle.gz 或 .mc.gz 文件，或粘贴解压后的图案文本。');
    if (text.length > maxBytes || new TextEncoder().encode(text).length > maxBytes) throw Error('图案文本需在 16 MiB 以内。');
    return text.trim().split(/\r\n|\n|\r/).map(line => line.trim());
  }

  function readRle(text) {
    const lines = checkedLines(text);
    let position = null, header = null;
    const data = [];
    for (const line of lines) {
      if (!line) continue;
      if (line.startsWith('#')) {
        if (/^#CXRLE\b.*\bPos\s*=/i.test(line)) {
          const match = line.match(/\bPos\s*=\s*([+-]?\d+)\s*,\s*([+-]?\d+)(?=\s|$)/i);
          if (!match) throw Error('RLE 原始坐标格式无效。');
          position = [Number(match[1]), Number(match[2])];
          if (!position.every(World.validCoordinate)) throw Error('RLE 原始坐标超出可精确计算的范围。');
        }
        continue;
      }
      if (/^@RULE\s/.test(line)) break;
      if (!header && !data.length && /^x\s*=/i.test(line)) {
        header = line.match(/^x\s*=\s*(\d+)\s*,\s*y\s*=\s*(\d+)(?:\s*,\s*rule\s*=\s*(.+))?$/i);
        if (!header) throw Error('RLE 开头应为 x = 宽, y = 高，可附带 rule。');
        continue;
      }
      data.push(line);
    }

    const runs = [], body = data.join('\n');
    let population = 0n;
    const token = /\s*(?:([1-9]\d*)?([.bo$A-X]|[p-y][A-X])|(!))/gy;
    let index = 0, x = 0, y = 0, width = Number(header?.[1] ?? 0), height = Number(header?.[2] ?? 0);
    while (index < body.length) {
      token.lastIndex = index;
      const match = token.exec(body);
      if (!match) throw Error(`RLE 图案在第 ${index + 1} 字附近无法读取。`);
      index = token.lastIndex;
      if (match[3]) {
        if (body.slice(index).trim()) throw Error('RLE 结束标记后还有图案数据。');
        break;
      }
      const length = Number(match[1] ?? 1), symbol = match[2];
      if (symbol === '$') { y += length; x = 0; }
      else {
        if (!World.validCoordinate(x + length)) throw Error('RLE 图案宽度超出坐标范围。');
        width = Math.max(width, x + length); height = Math.max(height, y + 1);
        if (symbol !== 'b' && symbol !== '.') {
          const state = symbol === 'o' ? 1 : symbol.length === 1 ? symbol.charCodeAt(0) - 64
            : (symbol.charCodeAt(0) - 111) * 24 + symbol.charCodeAt(1) - 64;
          if (state > 255) throw Error('RLE 元胞状态必须在 1–255 内。');
          const previous = runs.at(-1);
          if (previous && previous[1] === y && previous[3] === state && previous[0] + previous[2] === x) previous[2] += length;
          else {
            if (runs.length >= World.maxRuns) throw Error('图案区段超过 300 万。请把图案分开导入。');
            runs.push([x, y, length, state]);
          }
          population += BigInt(length);
        }
        x += length;
      }
      if (!World.validCoordinate(y)) throw Error('RLE 图案高度超出坐标范围。');
    }
    if (!World.validCoordinate(width) || !World.validCoordinate(height)) throw Error('RLE 图案尺寸超出坐标范围。');
    if (!runs.length) throw Error('这个 RLE 图案没有可放置的非零元胞。');
    return { runs, population: World.displayCount(population), width, height, position, rule: header?.[3]?.trim() ?? '' };
  }

  const macrocellHeader = /^\[M2\](?:\s|$)/;

  function macrocellLeaf(line) {
    if (line.length > 72) throw Error('8×8 叶节点超出范围');
    const runs = [];
    let size = 0;
    line.split('$').forEach((row, y) => {
      if (row.length > 8 || (y >= 8 && row.length)) throw Error('8×8 叶节点超出范围');
      for (const match of row.matchAll(/\*+/g)) {
        const length = match[0].length;
        runs.push([match.index, y, length, 1]);
        size += length;
      }
    });
    return { level: 3, runs, uniform: size === 0 ? 0 : size === 64 ? 1 : undefined };
  }

  function macrocellNode(line, nodes) {
    if (/^[.$*]+$/.test(line)) return macrocellLeaf(line);
    if (!/^\d+(?:\s+\d+){4}$/.test(line)) throw Error('节点应包含层级和四个整数');
    const [level, ...children] = line.split(/\s+/).map(Number);
    if (!Number.isSafeInteger(level) || level < 1 || level > 51 || !children.every(Number.isSafeInteger)) throw Error('节点层级或编号超出范围');
    if (level === 1) {
      if (children.some(state => state > 255)) throw Error('多状态叶节点的状态须为 0–255');
      const runs = children.flatMap((state, index) => state ? [[index % 2, index >> 1, 1, state]] : []);
      return { level, runs, uniform: children.every(state => state === children[0]) ? children[0] : undefined };
    }
    for (const id of children) {
      if (id !== 0 && nodes[id]?.level !== level - 1) throw Error('子节点编号或层级无效');
    }
    const states = children.map(id => id === 0 ? 0 : nodes[id].uniform);
    return { level, children, uniform: states.every(state => state === states[0]) ? states[0] : undefined };
  }

  function readMacrocell(text) {
    const lines = checkedLines(text), nodes = [null];
    let rule = '';
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line.startsWith('#')) {
        if (/^#R\s/.test(line)) rule = line.slice(2).trim();
        continue;
      }
      try { nodes.push(macrocellNode(line, nodes)); }
      catch (error) { throw Error(`Macrocell 第 ${i + 1} 行：${error.message}`); }
    }
    const root = nodes.at(-1);
    if (!root || root.uniform === 0) throw Error('这个 Macrocell 图案没有可放置的非零元胞。');

    const rows = new Map(), board = new World.SparseBoard();
    let runCount = 0, visited = 0, maxState = 0;
    function add(x, y, length, state) {
      let row = rows.get(y);
      if (!row) { row = []; rows.set(y, row); }
      const last = row.at(-1);
      if (last?.[1] === x && last[2] === state) last[1] += length;
      else {
        if (++runCount > World.maxRuns) throw Error('Macrocell 展开后超过 300 万个区段。请导入较小的区域。');
        row.push([x, x + length, state]);
      }
      maxState = Math.max(maxState, state);
    }
    // NW, NE, SW, SE order visits all occupied spans of a row from left to right.
    function visit(node, x, y) {
      if (!node || node.uniform === 0) return;
      if (++visited > 12000000) throw Error('Macrocell 图案展开过大。请导入较小的区域。');
      if (node.uniform !== undefined) {
        const side = 2 ** node.level;
        if (side > World.maxRuns) throw Error('Macrocell 展开后超过 300 万个区段。请导入较小的区域。');
        for (let dy = 0; dy < side; dy++) add(x, y + dy, side, node.uniform);
      } else if (node.runs) {
        for (const [dx, dy, length, state] of node.runs) add(x + dx, y + dy, length, state);
      } else {
        const half = 2 ** (node.level - 1);
        node.children.forEach((id, index) => visit(nodes[id], x + (index % 2) * half, y + (index >> 1) * half));
      }
    }
    const half = 2 ** (root.level - 1);
    visit(root, -half, 1 - half);
    for (const [y, row] of rows) board.replaceRow(y, row);
    const { minX, minY, maxX, maxY } = board.bounds(), origin = [minX, minY];
    return { board, origin, position: origin, maxState, width: maxX - minX + 1, height: maxY - minY + 1, rule };
  }

  function readPattern(text) {
    if (typeof text === 'string' && macrocellHeader.test(text.trimStart())) return readMacrocell(text);
    const { runs, width, height, position, rule } = readRle(text);
    const board = new World.SparseBoard();
    board.overlay(runs);
    const maxState = runs.reduce((highest, run) => Math.max(highest, run[3]), 0);
    return { board, origin: [0, 0], maxState, width, height, position, rule };
  }

  return { readRle, readPattern, readFile, maxBytes };
});
