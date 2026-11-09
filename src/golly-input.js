(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CellGollyInput = factory();
})(globalThis, function () {
  'use strict';

  const maxBytes = 1024 * 1024;
  const squareSlots = { Moore: [0, 1, 2, 3, 4, 5, 6, 7, 8], vonNeumann: [0, 1, 3, 5, 7] };
  const treeSlots = { 4: [1, 7, 3, 5, 0], 8: [8, 2, 6, 4, 1, 7, 3, 5, 0] };
  const generationPattern = /^([0-8]*)\/([0-8]*)\/(\d+)$/;

  function sourceSpec(source) {
    const text = source.trim();
    if (/^@RULE[ \t]/.test(text)) return { format: 'golly', text };
    const compact = text.replace(/\s/g, '').toUpperCase();
    const life = compact.match(/^B([0-8]*)\/?S([0-8]*)$/);
    if (life) return { format: 'bs', text: `B${life[1]}/S${life[2]}` };
    const oldLife = compact.match(/^([0-8]*)\/([0-8]*)$/);
    if (oldLife) return { format: 'bs', text: `B${oldLife[2]}/S${oldLife[1]}` };
    const generations = compact.match(generationPattern);
    if (generations) {
      const [, survive, birth, count] = generations;
      integer(count, 2, 256, 'Generations 状态数');
      if (birth.includes('0')) throw Error('Golly Generations 的出生条件需为 1–8');
      return Number(count) <= 32
        ? { format: 'sbc', text: `S${survive}/B${birth}/C${Number(count)}` }
        : { format: 'golly', text: compact };
    }
    throw Error('请输入 B/S、Generations（例如 345/2/4），或以 @RULE 开头的完整 .rule 文件。');
  }

  function integer(text, min, max, description) {
    const value = Number(text);
    if (!/^\d+$/.test(text) || value < min || value > max) throw Error(`${description}必须是 ${min}–${max} 的整数`);
    return value;
  }

  function splitSections(text) {
    const [first, ...lines] = text.split(/\r\n|\r|\n/);
    const match = first.trimEnd().match(/^@RULE[ \t]+([A-Za-z0-9_-]{1,250})$/);
    if (!match) throw Error('首行应为 @RULE 规则名，规则名可包含字母、数字、下划线和连字符。');
    const sections = new Map();
    let current = null;
    for (const line of lines) {
      const marker = line.trim().match(/^@([A-Za-z][A-Za-z0-9_]*)$/);
      if (marker) {
        current = sections.has(marker[1]) ? null : [];
        if (current) sections.set(marker[1], current);
      } else if (current) current.push(line);
    }
    return { name: match[1], sections };
  }

  function ruleLines(lines) {
    return lines.map(line => line.split('#', 1)[0].trim()).filter(Boolean);
  }

  function parameters(lines, keys, separator) {
    const values = new Map();
    for (const line of lines.slice(0, keys.length)) {
      const index = line.indexOf(separator);
      const key = line.slice(0, index).trim();
      if (index < 0 || !keys.includes(key) || values.has(key)) throw Error(`规则开头需要 ${keys.join('、')} 参数`);
      values.set(key, line.slice(index + 1).trim());
    }
    if (values.size !== keys.length) throw Error(`缺少 ${keys.join('、')} 参数`);
    return values;
  }

  function compileTree(lines) {
    const head = parameters(lines, ['num_states', 'num_neighbors', 'num_nodes'], '=');
    const count = integer(head.get('num_states'), 2, 256, '状态数');
    const slots = treeSlots[head.get('num_neighbors')];
    if (!Array.isArray(slots)) throw Error('规则树必须使用四邻域或八邻域');
    const nodeCount = integer(head.get('num_nodes'), slots.length, 200000, '规则树节点数');
    if (lines.length !== nodeCount + 3) throw Error('规则树节点数与 num_nodes 不符');
    if (nodeCount * (count + 1) > maxBytes / 2) throw Error('规则树分支数超过文件大小限制');
    const depths = new Uint8Array(nodeCount), children = new Uint32Array(nodeCount * count);
    for (let index = 0; index < nodeCount; index++) {
      const fields = lines[index + 3].split(/\s+/);
      if (fields.length !== count + 1) throw Error(`规则树节点 ${index} 的分支数不符`);
      const root = index === nodeCount - 1;
      const depth = integer(fields[0], root ? slots.length : 1, root ? slots.length : slots.length - 1, `规则树节点 ${index} 的深度`);
      depths[index] = depth;
      for (let state = 0; state < count; state++) {
        const child = integer(fields[state + 1], 0, depth === 1 ? count - 1 : index - 1, `规则树节点 ${index} 的分支`);
        if (depth > 1 && depths[child] !== depth - 1) throw Error(`规则树节点 ${index} 指向的深度不符`);
        children[index * count + state] = child;
      }
    }
    return {
      count,
      evaluate(neighbors) {
        let node = nodeCount - 1;
        for (const slot of slots) node = children[node * count + neighbors[slot]];
        return node;
      }
    };
  }

  function orientations(neighbors, symmetry) {
    const allowed = ['none', 'rotate4', 'rotate4reflect', 'reflect_horizontal', 'permute'];
    if (neighbors === 8) allowed.push('rotate8', 'rotate8reflect');
    if (!allowed.includes(symmetry)) throw Error(`该邻域暂不支持对称方式 ${symmetry}`);
    if (symmetry === 'permute') return null;
    const rotations = symmetry.startsWith('rotate8') ? 8 : symmetry.startsWith('rotate4') ? 4 : 1;
    const result = [];
    for (let turn = 0; turn < rotations; turn++) {
      const offset = turn * neighbors / rotations;
      result.push(Array.from({ length: neighbors }, (_, i) => 1 + (offset + i) % neighbors));
      if (symmetry.endsWith('reflect') || symmetry === 'reflect_horizontal') {
        result.push(Array.from({ length: neighbors }, (_, i) => 1 + (offset + neighbors - i) % neighbors));
      }
    }
    return result;
  }

  function permutationMatcher(slots) {
    const owner = new Int8Array(slots.length - 1);
    let seen;
    function assign(candidate, masks, neighbors) {
      const options = masks[neighbors[slots[candidate + 1]]];
      for (let bit = options & ~seen; bit; bit = options & ~seen) {
        const choice = bit & -bit, position = 31 - Math.clz32(choice);
        seen |= choice;
        if (owner[position] < 0 || assign(owner[position], masks, neighbors)) {
          owner[position] = candidate;
          return true;
        }
      }
      return false;
    }
    return (masks, neighbors) => {
      owner.fill(-1);
      for (let index = 0; index < owner.length; index++) {
        seen = 0;
        if (!assign(index, masks, neighbors)) return false;
      }
      return true;
    };
  }

  function compileTable(lines) {
    const head = parameters(lines, ['n_states', 'neighborhood', 'symmetries'], ':');
    const count = integer(head.get('n_states'), 2, 256, '状态数');
    const slots = squareSlots[head.get('neighborhood')];
    if (!Array.isArray(slots)) throw Error('目前支持 Moore（八邻域）和 vonNeumann（四邻域）规则表');
    const orders = orientations(slots.length - 1, head.get('symmetries'));
    const matchPermutation = orders ? null : permutationMatcher(slots);
    const variables = new Map(), byCenter = Array.from({ length: count }, () => []);
    const constants = byCenter.map((_, value) => [value]);
    let expanded = 0, indexed = 0;
    const stateList = token => variables.get(token) ?? constants[integer(token, 0, count - 1, `状态 ${token} `)];

    for (const [lineIndex, line] of lines.slice(3).entries()) {
      try {
        if (/^var\s/.test(line)) {
          const match = line.match(/^var\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:\{([^{}]+)\}|([A-Za-z_][A-Za-z0-9_]*))$/);
          if (!match || variables.has(match[1])) throw Error('变量定义无效或重复');
          const values = new Set();
          for (const token of (match[2] ?? match[3]).split(/[\s,]+/).filter(Boolean)) {
            for (const value of stateList(token)) values.add(value);
          }
          if (!values.size) throw Error('变量不能为空');
          variables.set(match[1], [...values]);
          continue;
        }
        const compact = !variables.size && count <= 10 && /^\d+$/.test(line);
        const tokens = compact ? [...line] : line.split(',').map(token => token.trim());
        if (tokens.length !== slots.length + 1) throw Error(`每条规则需要 ${slots.length + 1} 项`);
        const lists = tokens.map(stateList);
        const bound = [...new Set(tokens.filter(token => variables.has(token) && tokens.indexOf(token) !== tokens.lastIndexOf(token)))].sort();
        const boundIndices = tokens.map(token => bound.indexOf(token));
        const combinations = bound.reduce((total, token) => total * variables.get(token).length, 1);
        expanded += combinations;
        if (expanded > 20000) throw Error('绑定变量展开过多，最多 20000 条转换');
        if (boundIndices.at(-1) < 0 && lists.at(-1).length !== 1) throw Error('结果变量必须在输入中出现或只含一个状态');

        // RuleLoader visits bindings in name order, with the first name changing fastest.
        for (let ordinal = 0; ordinal < combinations; ordinal++) {
          let remaining = ordinal;
          const assignment = bound.map(token => {
            const values = variables.get(token), value = values[remaining % values.length];
            remaining = Math.floor(remaining / values.length);
            return value;
          });
          const values = lists.map((list, index) => boundIndices[index] < 0 ? list : constants[assignment[boundIndices[index]]]);
          const masks = new Uint8Array(count);
          for (let i = 1; i < slots.length; i++) for (const value of values[i]) masks[value] |= 1 << (i - 1);
          const row = { masks, result: values.at(-1)[0] };
          indexed += values[0].length;
          if (indexed > 1000000) throw Error('规则表过大，按中心状态展开后最多 100 万项');
          for (const center of values[0]) byCenter[center].push(row);
        }
      } catch (error) {
        throw Error(`规则表第 ${lineIndex + 1} 项：${error.message}`);
      }
    }
    return {
      count,
      evaluate(neighbors) {
        const center = neighbors[0];
        for (const { masks, result } of byCenter[center]) {
          if (matchPermutation) {
            if (matchPermutation(masks, neighbors)) return result;
          } else {
            for (const order of orders) {
              let index = 0;
              while (index < order.length && (masks[neighbors[slots[order[index]]]] & (1 << index))) index++;
              if (index === order.length) return result;
            }
          }
        }
        return center;
      }
    };
  }

  function compile(text) {
    if (!text || text.length > maxBytes || new TextEncoder().encode(text).length > maxBytes) throw Error('Golly 规则文件需在 1 MiB 以内');
    const generations = text.match(generationPattern);
    if (generations) {
      const [, survival, births, states] = generations;
      const count = integer(states, 2, 256, 'Generations 状态数');
      if (births.includes('0')) throw Error('Golly Generations 的出生条件需为 1–8');
      return {
        count, name: text, labels: Array.from({ length: count }, (_, index) => String(index)), nativeAlgorithm: 'Generations',
        birth: new Set([...births].map(Number)), survive: new Set([...survival].map(Number))
      };
    }
    const { name, sections } = splitSections(text);
    const kind = [...sections.keys()].find(section => section === 'TABLE' || section === 'TREE');
    if (!kind) throw Error('.rule 文件需要包含 @TABLE 或 @TREE');
    const lines = ruleLines(sections.get(kind));
    const rule = kind === 'TABLE' ? compileTable(lines) : compileTree(lines);
    const labels = Array.from({ length: rule.count }, (_, index) => String(index));
    for (const line of sections.get('NAMES') ?? []) {
      const match = line.trim().match(/^(\d+)\s+(.+)$/);
      if (match && Number(match[1]) < rule.count) labels[Number(match[1])] = match[2];
    }
    return { ...rule, name, labels, nativeAlgorithm: 'RuleLoader' };
  }

  return { sourceSpec, compile, maxBytes };
});
