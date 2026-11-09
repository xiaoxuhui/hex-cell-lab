(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./world.js'));
  else root.CellPattern = factory(root.CellWorld);
})(globalThis, function (World) {
  'use strict';

  const maxBytes = 16 * 1024 * 1024;

  function readRle(text) {
    if (typeof text !== 'string' || !text.trim()) throw Error('请粘贴或选择一个 RLE 图案。');
    if (text.length > maxBytes || new TextEncoder().encode(text).length > maxBytes) throw Error('RLE 文件需在 16 MiB 以内。');
    const lines = text.trim().split(/\r\n|\n|\r/).map(line => line.trim());
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
            if (runs.length >= World.maxRuns) throw Error('图案区段超过 100 万。请把图案分开导入。');
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

  return { readRle, maxBytes };
});
