import type { ID, MapDoc, ThoughtNode } from '../types';

export const DOC_KEY = 'freethought-map:doc:v1';

export function nid(): ID {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function createEmptyDoc(): MapDoc {
  const root: ThoughtNode = {
    id: nid(),
    parentId: null,
    title: '中心主题',
    body: '',
    tags: [],
    position: { x: 0, y: 0 },
  };
  return { version: 1, nodes: { [root.id]: root }, freeLinks: [], updatedAt: Date.now() };
}

export function loadDoc(): MapDoc | null {
  try {
    const raw = localStorage.getItem(DOC_KEY);
    if (!raw) return null;
    const doc = JSON.parse(raw) as MapDoc;
    if (!doc || doc.version !== 1 || !doc.nodes || typeof doc.nodes !== 'object') return null;
    // 允许存在多个顶层节点：用户主动断开的边就是真的断开，载入时不做任何自动归一
    return { ...doc, freeLinks: doc.freeLinks ?? [] };
  } catch (e) {
    console.warn('[FreeThought Map] 本地数据读取失败，已回退为空文档', e);
    return null;
  }
}

// ponytail: localStorage 上限约 5MB，够 300+ 纯文本节点；超限时升级为 IndexedDB（README §4.6 已列备选）
let saveTimer: number | undefined;
export function saveDocDebounced(doc: MapDoc) {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(DOC_KEY, JSON.stringify(doc));
    } catch (e) {
      console.warn('[FreeThought Map] 本地保存失败（可能超出容量）', e);
    }
  }, 300);
}

/** 顶层节点：无父，或父节点已不存在 */
export function rootIds(doc: MapDoc): ID[] {
  return Object.values(doc.nodes)
    .filter((n) => !n.parentId || !doc.nodes[n.parentId])
    .map((n) => n.id);
}

export function childrenMap(doc: MapDoc): Map<ID | null, ID[]> {
  const map = new Map<ID | null, ID[]>();
  for (const n of Object.values(doc.nodes)) {
    const list = map.get(n.parentId);
    if (list) list.push(n.id);
    else map.set(n.parentId, [n.id]);
  }
  return map;
}

/** 被折叠祖先隐藏的节点集合（仅视觉隐藏，数据不动） */
export function hiddenIds(doc: MapDoc): Set<ID> {
  const kids = childrenMap(doc);
  const hidden = new Set<ID>();
  const walk = (id: ID) => {
    for (const c of kids.get(id) ?? []) {
      if (!hidden.has(c)) {
        hidden.add(c);
        walk(c);
      }
    }
  };
  for (const n of Object.values(doc.nodes)) if (n.collapsed) walk(n.id);
  return hidden;
}

function depthOf(doc: MapDoc, id: ID, guard = new Set<ID>()): number {
  const node = doc.nodes[id];
  if (!node || !node.parentId || guard.has(id)) return 0;
  guard.add(id);
  return 1 + depthOf(doc, node.parentId, guard);
}

/** Markdown 大纲：Tree 结构 + 自由联想清单。单向产物，不支持反向导入。 */
export function toMarkdown(doc: MapDoc): string {
  const kids = childrenMap(doc);
  const lines: string[] = [];

  const walk = (id: ID, depth: number) => {
    const n = doc.nodes[id];
    if (!n) return;
    const title = n.title || '未命名';
    const suffix = n.body ? `（${n.body.replace(/\s+/g, ' ').trim()}）` : '';
    lines.push(`${'  '.repeat(depth)}- ${title}${suffix}`);
    for (const c of kids.get(id) ?? []) walk(c, depth + 1);
  };

  for (const r of rootIds(doc)) walk(r, 0);

  const links = doc.freeLinks.filter((l) => doc.nodes[l.a] && doc.nodes[l.b]);
  if (links.length) {
    lines.push('', '## 自由联想');
    for (const l of links) {
      lines.push(`- ${doc.nodes[l.a].title || '未命名'} — ${doc.nodes[l.b].title || '未命名'}`);
    }
  }

  lines.push('', '---', '', `导出时间：${new Date().toLocaleString('zh-CN')}　节点数：${Object.keys(doc.nodes).length}　自由联想线：${links.length}`);

  if (!lines.some((l) => l.startsWith('- '))) {
    return `# ${doc.nodes[rootIds(doc)[0]]?.title || 'FreeThought Map'}\n\n（空图）\n`;
  }
  const rootTitle = doc.nodes[rootIds(doc)[0]]?.title || 'FreeThought Map';
  return `# ${rootTitle}\n\n${lines.join('\n')}\n`;
}

export function nodeDepth(doc: MapDoc, id: ID): number {
  return depthOf(doc, id);
}

export function download(filename: string, content: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
