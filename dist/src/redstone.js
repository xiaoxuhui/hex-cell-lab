(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CellRedstone = factory();
})(globalThis, function () {
  'use strict';

  const formula = 'redstone(E, B, F, H, D)';
  const dust = 1, block = 17, torchBase = 18, repeaterBase = 26;
  const directions = ['↑', '→', '↓', '←'];
  const opposite = direction => (direction + 2) % 4;
  const torch = (direction, powered = true) => torchBase + direction * 2 + Number(powered);
  const repeater = (direction, delay, powered = false, remaining = 0) =>
    repeaterBase + direction * 32 + (delay - 1) * 8 + Number(powered) * 4 + remaining;

  const parts = [{ kind: 'empty', strength: 0, name: '空白', color: '#1a2d22', ports: 0 }];
  for (let strength = 0; strength <= 15; strength++) {
    parts.push({ kind: 'dust', strength, name: '红石粉', color: `hsl(${strength} 81% ${29 + strength * 2.2}%)`, ports: 15 });
  }
  parts.push({ kind: 'block', strength: 15, name: '红石块', color: '#e83a47', ports: 15 });
  for (let direction = 0; direction < 4; direction++) {
    for (const powered of [false, true]) {
      parts[torch(direction, powered)] = {
        kind: 'torch', strength: powered ? 15 : 0, direction, name: '红石火把',
        color: powered ? '#ffb47d' : '#72575d', ports: 15 ^ (1 << opposite(direction))
      };
    }
    for (let delay = 1; delay <= 4; delay++) {
      for (const powered of [false, true]) {
        for (let remaining = 0; remaining < 4; remaining++) {
          parts[repeater(direction, delay, powered, remaining)] = {
            kind: 'repeater', strength: powered ? 15 : 0, direction, delay, powered, remaining,
            name: '红石中继器', color: powered ? '#ff8c98' : '#8991a3', ports: 1 << direction
          };
        }
      }
    }
  }

  function isPreset(rule) {
    return rule.format === 'expression' && rule.text.replace(/\s/g, '') === 'redstone(E,B,F,H,D)';
  }

  function describe(value) {
    const part = parts[value];
    if (!part || part.kind === 'empty') return '空白';
    const direction = part.direction === undefined ? '' : ' ' + directions[part.direction];
    let label = `${part.name}${direction} · 强度 ${part.strength}`;
    if (part.delay !== undefined) label += ` · 延时 ${part.delay} 代`;
    if (part.remaining) label += ` · 等待 ${part.remaining} 代`;
    return label;
  }

  function signal(value, direction, throughDust = false) {
    const part = parts[value];
    if (!part || !(part.ports & (1 << direction))) return 0;
    return throughDust && part.kind === 'dust' ? Math.max(0, part.strength - 1) : part.strength;
  }

  // Each update reads only the previous generation and keeps the component in place.
  function transition(center, north, east, south, west) {
    const part = parts[center];
    if (!part) return 0;
    if (part.kind === 'empty' || part.kind === 'block') return center;
    if (part.kind === 'dust') {
      return dust + Math.max(signal(north, 2, true), signal(east, 3, true), signal(south, 0, true), signal(west, 1, true));
    }
    const rear = [north, east, south, west][opposite(part.direction)];
    const input = signal(rear, part.direction) > 0;
    if (part.kind === 'torch') return torch(part.direction, !input);

    const { direction, delay, powered, remaining } = part;
    if (remaining) {
      if (powered && input) return repeater(direction, delay, true);
      // Finish a pending rise even if the input pulse ended during the wait.
      return remaining === 1 ? repeater(direction, delay, !powered) : repeater(direction, delay, powered, remaining - 1);
    }
    if (input === powered) return center;
    return delay === 1 ? repeater(direction, delay, input) : repeater(direction, delay, powered, delay - 1);
  }

  function demo() {
    const width = 24, height = 11, grid = Array(width * height).fill(0);
    const put = (x, y, value) => { grid[y * width + x] = value; };
    put(2, 3, block);
    for (let x = 3; x <= 15; x++) put(x, 3, dust);
    put(16, 3, repeater(1, 3));
    for (let x = 17; x <= 21; x++) put(x, 3, dust);
    put(2, 7, block);
    put(3, 7, torch(1, false));
    for (let x = 4; x <= 10; x++) put(x, 7, dust);
    put(14, 7, torch(1));
    for (let x = 15; x <= 21; x++) put(x, 7, dust);
    return { version: 1, width, height, generation: 0, boundary: 'zero', rule: { format: 'expression', text: formula }, grid };
  }

  return { formula, isPreset, describe, parts, dust, block, torch, repeater, directions, opposite, signal, transition, demo };
});
