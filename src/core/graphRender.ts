/**
 * Graph Rendering Module
 * 将 dep-graph.json 和 doc-index.json 中的关系数据渲染为可视化输出
 * 支持：ASCII 文本图、SVG 文件
 */

import * as path from 'path';
import * as fs from 'fs';
import { loadDependencyGraph, DependencyGraph } from './buildDeps';
import { loadDocIndex, DocIndex } from './buildDocIndex';
import { walkFiles } from '../utils/fileWalker';

// ─── Types ───────────────────────────────────────────────────────────────────

export type NodeType = 'source' | 'doc';
export type EdgeType = 'import' | 'refers' | 'links';
export type OutputFormat = 'ascii' | 'svg' | 'dot' | 'sigma';

export interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  parent?: string; // for grouping
}

export interface GraphEdge {
  from: string;
  to: string;
  type: EdgeType;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ─── Graph Data Extraction ──────────────────────────────────────────────────

/**
 * Load and merge all relationship data into a unified GraphData structure.
 * Builds doc-to-doc edges on-the-fly from wiki markdown files.
 */
export function loadGraphData(projectRoot: string): GraphData {
  const wikiDir = path.join(projectRoot, '.nium-wiki', 'wiki');
  const depGraph = loadDependencyGraph(projectRoot);
  const docIndex = loadDocIndex(projectRoot);

  // Detect path-prefix mismatch between dep-graph and doc-index.
  // Some projects store source code under a subdir (e.g. restored-src/) while
  // wiki markdown links reference a different prefix (e.g. src/).
  // Normalize dep-graph keys so they match doc-index keys for cross-type joins.
  let depPrefixToStrip = '';
  if (depGraph && docIndex) {
    const docKeys = new Set([
      ...Object.keys(docIndex.sourceToDoc),
      ...Object.values(docIndex.docToSources).flat(),
    ]);
    const depKeys = Object.keys(depGraph.imports);
    // Find a dep-graph key that ends with a doc-index key and use the prefix as offset
    let bestPrefix = '';
    for (const dk of depKeys) {
      for (const dck of docKeys) {
        if (dk.endsWith(dck) && dk.length > dck.length) {
          const p = dk.slice(0, -dck.length);
          if (!bestPrefix || p.length < bestPrefix.length) bestPrefix = p;
        }
      }
    }
    if (bestPrefix) depPrefixToStrip = bestPrefix;
  }

  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  // 1. Source files from dep-graph
  if (depGraph) {
    for (const file of Object.keys(depGraph.imports)) {
      const normFile = depPrefixToStrip && file.startsWith(depPrefixToStrip)
        ? file.slice(depPrefixToStrip.length) : file;
      if (!nodes.has(normFile)) {
        nodes.set(normFile, {
          id: normFile,
          label: shortLabel(normFile),
          type: 'source',
          parent: topLevelDir(normFile),
        });
      }
      // edges: import relationships
      for (const dep of depGraph.imports[file]) {
        const normDep = depPrefixToStrip && dep.startsWith(depPrefixToStrip)
          ? dep.slice(depPrefixToStrip.length) : dep;
        if (!nodes.has(normDep)) {
          nodes.set(normDep, {
            id: normDep,
            label: shortLabel(normDep),
            type: 'source',
            parent: topLevelDir(normDep),
          });
        }
        edges.push({ from: normFile, to: normDep, type: 'import' });
      }
    }
  }

  // 2. Docs from doc-index (source → doc edges)
  if (docIndex) {
    for (const [src, docs] of Object.entries(docIndex.sourceToDoc)) {
      if (!nodes.has(src)) {
        nodes.set(src, {
          id: src,
          label: shortLabel(src),
          type: 'source',
          parent: topLevelDir(src),
        });
      }
      for (const doc of docs) {
        if (!nodes.has(doc)) {
          nodes.set(doc, {
            id: doc,
            label: shortLabel(doc),
            type: 'doc',
            parent: topLevelDir(doc),
          });
        }
        edges.push({ from: src, to: doc, type: 'refers' });
      }
    }
    // doc → source
    for (const [doc, sources] of Object.entries(docIndex.docToSources)) {
      if (!nodes.has(doc)) {
        nodes.set(doc, {
          id: doc,
          label: shortLabel(doc),
          type: 'doc',
          parent: topLevelDir(doc),
        });
      }
      for (const src of sources) {
        if (!nodes.has(src)) {
          nodes.set(src, {
            id: src,
            label: shortLabel(src),
            type: 'source',
            parent: topLevelDir(src),
          });
        }
        edges.push({ from: doc, to: src, type: 'refers' });
      }
    }
  }

  // 3. Doc-to-doc links (computed on-the-fly)
  if (fs.existsSync(wikiDir)) {
    const mdFiles = walkFiles(wikiDir, { extensions: ['.md'] });
    for (const mdFile of mdFiles) {
      const relDoc = path.relative(wikiDir, mdFile).replace(/\\/g, '/');
      if (!nodes.has(relDoc)) {
        nodes.set(relDoc, {
          id: relDoc,
          label: shortLabel(relDoc),
          type: 'doc',
          parent: topLevelDir(relDoc),
        });
      }
      const content = fs.readFileSync(mdFile, 'utf-8');
      const linkPattern = /\]\((?!http)(?!#)([^)]+\.md)(?:#[^)]+)?\)/g;
      let match;
      while ((match = linkPattern.exec(content)) !== null) {
        let linkedDoc = match[1].startsWith('/') ? match[1].slice(1) : match[1];
        if (linkedDoc.startsWith('./')) {
          linkedDoc = path.posix.join(path.posix.dirname(relDoc), linkedDoc.slice(2));
        } else if (linkedDoc.startsWith('../')) {
          const resolved = path.posix.resolve('/' + path.posix.dirname(relDoc), linkedDoc);
          // Drop links that escape the wiki dir (resolved no longer starts with '/')
          if (!resolved.startsWith('/')) continue;
          linkedDoc = resolved.slice(1);
          // Also drop if the relative path still escapes (e.g. resolved to root)
          if (!linkedDoc || linkedDoc.startsWith('..')) continue;
        }
        if (!nodes.has(linkedDoc)) {
          nodes.set(linkedDoc, {
            id: linkedDoc,
            label: shortLabel(linkedDoc),
            type: 'doc',
            parent: topLevelDir(linkedDoc),
          });
        }
        edges.push({ from: relDoc, to: linkedDoc, type: 'links' });
      }
    }
  }

  return { nodes: [...nodes.values()], edges };
}

/**
 * Filter graph to a sub-path and/or edge type.
 */
export function filterGraph(
  data: GraphData,
  opts: {
    pathPrefix?: string;
    edgeTypes?: EdgeType[];
    nodeTypes?: NodeType[];
    maxNodes?: number;
  },
): GraphData {
  const { pathPrefix, edgeTypes, nodeTypes, maxNodes } = opts;

  let nodes = data.nodes;
  let edges = data.edges;

  if (pathPrefix) {
    const prefix = pathPrefix.replace(/\/$/, '');
    const keepIds = new Set<string>();
    for (const n of nodes) {
      if (n.id.startsWith(prefix) || n.id.startsWith(prefix + '/')) {
        keepIds.add(n.id);
      }
    }
    // Also keep direct neighbors
    for (const e of edges) {
      if (keepIds.has(e.from) || keepIds.has(e.to)) {
        keepIds.add(e.from);
        keepIds.add(e.to);
      }
    }
    nodes = nodes.filter(n => keepIds.has(n.id));
    edges = edges.filter(e => keepIds.has(e.from) && keepIds.has(e.to));
  }

  if (edgeTypes && edgeTypes.length > 0) {
    const types = new Set(edgeTypes);
    edges = edges.filter(e => types.has(e.type));
  }

  if (nodeTypes && nodeTypes.length > 0) {
    const types = new Set(nodeTypes);
    nodes = nodes.filter(n => types.has(n.type));
    const nodeIds = new Set(nodes.map(n => n.id));
    edges = edges.filter(e => nodeIds.has(e.from) && nodeIds.has(e.to));
  }

  if (maxNodes && maxNodes > 0 && nodes.length > maxNodes) {
    // Count degree per node so high-connectivity nodes are preferred
    const degree = new Map<string, number>();
    for (const e of edges) {
      degree.set(e.from, (degree.get(e.from) || 0) + 1);
      degree.set(e.to, (degree.get(e.to) || 0) + 1);
    }
    // Cross-type edges (refers, links between doc/source) are the most
    // informative — pin both endpoints first so they survive sampling
    const pinned = new Set<string>();
    const nodeById = new Map(nodes.map(n => [n.id, n]));
    for (const e of edges) {
      const a = nodeById.get(e.from);
      const b = nodeById.get(e.to);
      if (a && b && a.type !== b.type) {
        pinned.add(e.from);
        pinned.add(e.to);
      }
    }
    const selected: typeof nodes = nodes.filter(n => pinned.has(n.id));
    // Allocate remaining slots proportionally by type, preferring high-degree
    const remaining = maxNodes - selected.length;
    if (remaining > 0) {
      const rest = nodes.filter(n => !pinned.has(n.id));
      const byType = new Map<string, typeof nodes>();
      for (const n of rest) {
        if (!byType.has(n.type)) byType.set(n.type, []);
        byType.get(n.type)!.push(n);
      }
      for (const [, group] of byType) {
        const quota = Math.max(1, Math.round((group.length / rest.length) * remaining));
        const sorted = group.slice().sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0));
        selected.push(...sorted.slice(0, quota));
      }
    }
    // Fill any leftover slots with highest-degree nodes not yet selected
    if (selected.length < maxNodes) {
      const selectedIds = new Set(selected.map(n => n.id));
      const leftover = nodes
        .filter(n => !selectedIds.has(n.id))
        .sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0));
      selected.push(...leftover.slice(0, maxNodes - selected.length));
    }
    nodes = selected.slice(0, maxNodes);
    const nodeIds = new Set(nodes.map(n => n.id));
    edges = edges.filter(e => nodeIds.has(e.from) && nodeIds.has(e.to));
  }

  return { nodes, edges };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function topLevelDir(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  return parts[0] || '_root';
}

function shortLabel(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[1];
  return parts.slice(-2).join('/');
}

// ─── ASCII Renderer ─────────────────────────────────────────────────────────

/**
 * Render graph as ASCII art grouped by top-level directory.
 * Compact adjacency-list style.
 */
export function renderAscii(data: GraphData): string {
  const { nodes, edges } = data;
  if (nodes.length === 0) return '(empty graph)';

  // Build adjacency map
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    if (adj.has(e.from) && adj.has(e.to)) {
      adj.get(e.from)!.push(e.to);
    }
  }

  // Group by top-level dir
  const groups = new Map<string, GraphNode[]>();
  for (const n of nodes) {
    const g = n.parent || '_root';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(n);
  }

  const edgeLabel: Record<EdgeType, string> = {
    import: '→',
    refers: '↔',
    links: '⇒',
  };

  const typeTag: Record<NodeType, string> = {
    source: '[src]',
    doc: '[doc]',
  };

  const lines: string[] = [];
  const sortedGroups = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));

  for (let gi = 0; gi < sortedGroups.length; gi++) {
    const [group, groupNodes] = sortedGroups[gi];
    const isLastGroup = gi === sortedGroups.length - 1;
    const groupPrefix = isLastGroup ? '└── ' : '├── ';

    lines.push('');
    lines.push(`┌─ ${group}/`);
    for (let ni = 0; ni < groupNodes.length; ni++) {
      const node = groupNodes[ni];
      const isLast = ni === groupNodes.length - 1 && isLastGroup;
      const nodePrefix = isLast ? '└── ' : '├── ';
      const tag = typeTag[node.type];
      const deps = adj.get(node.id) || [];
      lines.push(`${nodePrefix}${tag} ${node.label}`);

      if (deps.length > 0) {
        const maxShow = 6;
        const shown = deps.slice(0, maxShow);
        const hidden = deps.length - shown.length;
        for (let di = 0; di < shown.length; di++) {
          const dep = shown[di];
          const depNode = nodes.find(n => n.id === dep);
          const depLabel = depNode ? depNode.label : shortLabel(dep);
          const arrow = edgeLabel[edges.find(e => e.from === node.id && e.to === dep)?.type || 'import'];
          const isLastDep = di === shown.length - 1 && hidden === 0;
          const depPrefix = isLast ? '    ' : '│   ';
          lines.push(`${depPrefix}  ${arrow} ${depLabel}`);
        }
        if (hidden > 0) {
          const prefix = isLast ? '    ' : '│   ';
          lines.push(`${prefix}    … +${hidden} more`);
        }
      }
    }
  }

  lines.push('');
  lines.push(`  ${nodes.length} nodes · ${edges.length} edges`);
  return lines.join('\n');
}

/**
 * Summary table: list top-level directories with node/edge counts.
 */
export function renderAsciiSummary(data: GraphData): string {
  const groups = new Map<string, { sources: number; docs: number; edges: number }>();
  for (const n of data.nodes) {
    const g = n.parent || '_root';
    if (!groups.has(g)) groups.set(g, { sources: 0, docs: 0, edges: 0 });
    const gr = groups.get(g)!;
    if (n.type === 'source') gr.sources++;
    else if (n.type === 'doc') gr.docs++;
  }
  for (const e of data.edges) {
    const fromNode = data.nodes.find(n => n.id === e.from);
    const g = fromNode?.parent || '_root';
    if (!groups.has(g)) groups.set(g, { sources: 0, docs: 0, edges: 0 });
    groups.get(g)!.edges++;
  }

  const lines: string[] = [
    '',
    '  Directory          Sources    Docs    Edges',
    '  ─────────────────────────────────────────',
  ];

  const sorted = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [group, { sources, docs, edges }] of sorted) {
    const name = group.padEnd(16);
    lines.push(`  ${name}  ${String(sources).padStart(7)}  ${String(docs).padStart(4)}  ${String(edges).padStart(5)}`);
  }

  const totalS = data.nodes.filter(n => n.type === 'source').length;
  const totalD = data.nodes.filter(n => n.type === 'doc').length;
  lines.push('  ─────────────────────────────────────────');
  lines.push(`  ${'total'.padEnd(16)}  ${String(totalS).padStart(7)}  ${String(totalD).padStart(4)}  ${String(data.edges.length).padStart(5)}`);
  lines.push('');
  return lines.join('\n');
}

// ─── SVG Renderer ───────────────────────────────────────────────────────────

const NODE_W = 140;
const NODE_H = 36;
const PAD_X = 24;
const PAD_Y = 20;
const RANK_Y = 64; // vertical spacing between ranks
const ARROW_SIZE = 8;

const TYPE_COLOR: Record<NodeType, { fill: string; stroke: string; text: string }> = {
  source: { fill: '#1e3a5f', stroke: '#60a5fa', text: '#e2e8f0' },
  doc: { fill: '#3b1f00', stroke: '#f59e0b', text: '#fef3c7' },
};

const EDGE_COLOR: Record<EdgeType, string> = {
  import: '#64748b',
  refers: '#60a5fa',
  links: '#94a3b8',
};

const EDGE_STYLE: Record<EdgeType, string> = {
  import: 'solid',
  refers: 'dotted',
  links: 'dashed',
};

/**
 * Render graph as SVG. Uses a simple layered layout (topological ranks).
 */
export function renderSvg(data: GraphData, opts: { title?: string } = {}): string {
  const { nodes, edges } = data;
  if (nodes.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg"><text x="10" y="20" fill="#666">empty graph</text></svg>`;
  }

  // Assign ranks (BFS from nodes with no incoming edges)
  const rankOf = new Map<string, number>();
  const incomingCount = new Map<string, number>();
  for (const n of nodes) incomingCount.set(n.id, 0);
  for (const e of edges) {
    incomingCount.set(e.to, (incomingCount.get(e.to) || 0) + 1);
  }

  const queue = nodes.filter(n => (incomingCount.get(n.id) || 0) === 0).map(n => n.id);
  for (const q of queue) rankOf.set(q, 0);

  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    const r = rankOf.get(cur)!;
    const neighbors = edges.filter(e => e.from === cur).map(e => e.to);
    for (const nb of neighbors) {
      if (!rankOf.has(nb)) {
        rankOf.set(nb, r + 1);
        queue.push(nb);
      } else {
        rankOf.set(nb, Math.max(rankOf.get(nb)!, r + 1));
      }
    }
  }

  // Assign unranked nodes
  for (const n of nodes) {
    if (!rankOf.has(n.id)) rankOf.set(n.id, 0);
  }

  // Group by rank
  const ranks = new Map<number, string[]>();
  for (const [id, r] of rankOf) {
    if (!ranks.has(r)) ranks.set(r, []);
    ranks.get(r)!.push(id);
  }

  const maxRank = Math.max(...[...ranks.keys()]);

  // Positions
  const pos = new Map<string, { x: number; y: number }>();
  for (const [rank, ids] of ranks) {
    const y = PAD_Y + rank * RANK_Y;
    const totalW = ids.length * NODE_W + (ids.length - 1) * PAD_X;
    let x = PAD_X;
    for (const id of ids) {
      pos.set(id, { x, y });
      x += NODE_W + PAD_X;
    }
  }

  const maxX = Math.max(...[...pos.values()].map(p => p.x)) + NODE_W + PAD_X;
  const maxY = Math.max(...[...pos.values()].map(p => p.y)) + NODE_H + PAD_Y;
  const W = maxX;
  const H = Math.max(maxY, 200);

  const edgePaths: string[] = [];
  for (const e of edges) {
    const from = pos.get(e.from);
    const to = pos.get(e.to);
    if (!from || !to) continue;

    const x1 = from.x + NODE_W;
    const y1 = from.y + NODE_H / 2;
    const x2 = to.x;
    const y2 = to.y + NODE_H / 2;

    const color = EDGE_COLOR[e.type];
    const midX = (x1 + x2) / 2;

    if (Math.abs(y1 - y2) < 4) {
      edgePaths.push(
        `<path d="M${x1},${y1} L${x2 - ARROW_SIZE},${y2}" stroke="${color}" stroke-width="1.5" fill="none" marker-end="url(#arrow)"/>`
      );
    } else {
      edgePaths.push(
        `<path d="M${x1},${y1} C${midX},${y1} ${midX},${y2} ${x2 - ARROW_SIZE},${y2}" stroke="${color}" stroke-width="1.5" fill="none" marker-end="url(#arrow)"/>`
      );
    }
  }

  const nodeRects: string[] = [];
  for (const n of nodes) {
    const p = pos.get(n.id);
    if (!p) continue;
    const c = TYPE_COLOR[n.type];
    nodeRects.push(
      `<rect x="${p.x}" y="${p.y}" width="${NODE_W}" height="${NODE_H}" rx="6" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.5"/>` +
      `<text x="${p.x + NODE_W / 2}" y="${p.y + NODE_H / 2 + 5}" text-anchor="middle" fill="${c.text}" font-size="11" font-family="monospace">${escXml(n.label)}</text>`
    );
  }

  const title = opts.title || 'nium-wiki relationship graph';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="background:#0f172a">
  <defs>
    <marker id="arrow" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto">
      <path d="M0,0 L8,4 L0,8 Z" fill="#64748b"/>
    </marker>
  </defs>
  <text x="${PAD_X}" y="${H - 8}" fill="#475569" font-size="10" font-family="monospace">${escXml(title)} · ${nodes.length} nodes · ${edges.length} edges</text>
  ${edgePaths.join('\n')}
  ${nodeRects.join('\n')}
</svg>`;
}

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── DOT Renderer ───────────────────────────────────────────────────────────

/**
 * Render graph in DOT (Graphviz) format.
 */
export function renderDot(data: GraphData, opts: { directed?: boolean; name?: string } = {}): string {
  const { nodes, edges } = data;
  const directed = opts.directed !== false;
  const graphName = opts.name || 'nium_wiki_graph';
  const edgeOp = directed ? '->' : '--';

  const typeColor: Record<NodeType, string> = {
    source: '#60a5fa',
    doc: '#f59e0b',
  };

  const lines: string[] = [];
  lines.push(directed ? `digraph ${graphName} {` : `graph ${graphName} {`);
  lines.push('  rankdir=LR;');
  lines.push('  node [shape=box style=filled fontname="monospace"];');

  for (const n of nodes) {
    const color = typeColor[n.type];
    lines.push(`  "${escDot(n.id)}" [label="${escDot(n.label)}" fillcolor="${color}" fontcolor="#0f172a"];`);
  }

  lines.push('');
  for (const e of edges) {
    const style = e.type === 'links' ? 'dashed' : 'solid';
    lines.push(`  "${escDot(e.from)}" ${edgeOp} "${escDot(e.to)}" [style=${style} color="${EDGE_COLOR[e.type]}"];`);
  }

  lines.push('}');
  return lines.join('\n');
}

function escDot(s: string): string {
  return s.replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

// ─── Sigma.js Interactive Renderer ─────────────────────────────────────────

/**
 * Read vendor JS bundles from node_modules at generation time and inline them.
 * Falls back to a graceful error message if vendor files are missing.
 */
function loadVendorScript(pkg: string, relPath: string): string {
  const candidates = [
    path.join(__dirname, '..', '..', 'node_modules', pkg, relPath),
    path.join(__dirname, '..', '..', '..', 'node_modules', pkg, relPath),
    path.join(process.cwd(), 'node_modules', pkg, relPath),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate, 'utf-8');
    }
  }
  throw new Error(`Vendor script not found: ${pkg}/${relPath} — run 'npm install' or check node_modules`);
}

const TYPE_COLOR_HEX: Record<NodeType, string> = {
  source: '#60a5fa',
  doc: '#f59e0b',
};

const EDGE_COLOR_HEX: Record<EdgeType, string> = {
  import: '#94a3b8',
  refers: '#93c5fd',
  links: '#b0bec5',
};

interface SigmaNode {
  id: string;
  label: string;
  fullPath: string;
  nodeType: NodeType;
  size: number;
  color: string;
  inDegree: number;
  outDegree: number;
  x: number;
  y: number;
  hidden: boolean;
}

interface SigmaEdge {
  source: string;
  target: string;
  edgeType: EdgeType;
  color: string;
  size: number;
}

function buildSigmaData(data: GraphData, initialIds: Set<string>): { nodes: SigmaNode[]; edges: SigmaEdge[] } {
  const nodeIdSet = new Set(data.nodes.map(n => n.id));

  // Base attributes for all nodes — non-initial nodes default to hidden
  const allNodes: SigmaNode[] = data.nodes.map(n => {
    const inDegree = data.edges.filter(e => e.to === n.id).length;
    const outDegree = data.edges.filter(e => e.from === n.id).length;
    return {
      id: n.id,
      label: n.label,
      fullPath: n.id,
      nodeType: n.type,
      size: Math.max(4, Math.min(16, 4 + Math.sqrt(inDegree + outDegree) * 2)),
      color: TYPE_COLOR_HEX[n.type],
      inDegree,
      outDegree,
      x: 0,
      y: 0,
      hidden: !initialIds.has(n.id),
    };
  });

  // Place non-initial nodes in a large outer ring (out of the way)
  const outerRadius = Math.max(2000, data.nodes.length * 4);
  const nonInitial = allNodes.filter(n => n.hidden);
  nonInitial.forEach((n, idx) => {
    const angle = (idx / Math.max(nonInitial.length, 1)) * 2 * Math.PI;
    n.x = Math.cos(angle) * outerRadius;
    n.y = Math.sin(angle) * outerRadius;
  });

  // ForceAtlas2 on initial nodes only — they spread out naturally to fill the viewport
  const initialNodes = allNodes.filter(n => !n.hidden);
  const initialEdges = data.edges
    .filter(e => initialIds.has(e.from) && initialIds.has(e.to))
    .map(e => ({ source: e.from, target: e.to, edgeType: e.type, color: EDGE_COLOR_HEX[e.type], size: 1.2 }));

  // Random spread as starting point — gives nodes room to disperse before force settling
  const spreadSize = 4000;
  initialNodes.forEach(n => {
    n.x = (Math.random() - 0.5) * spreadSize;
    n.y = (Math.random() - 0.5) * spreadSize;
  });

  applyRepulsionLayout(initialNodes);

  const sigmaEdges: SigmaEdge[] = data.edges
    .filter(e => nodeIdSet.has(e.from) && nodeIdSet.has(e.to))
    .map(e => ({
      source: e.from,
      target: e.to,
      edgeType: e.type,
      color: EDGE_COLOR_HEX[e.type],
      size: 1.2,
    }));

  return { nodes: allNodes, edges: sigmaEdges };
}

/**
 * Pure repulsion layout: nodes push each other apart within a soft circular boundary.
 * No concentric layers — just a naturally spread, roughly spherical cloud.
 */
function applyRepulsionLayout(nodes: SigmaNode[]): void {
  const n = nodes.length;
  if (n === 0) return;

  const MAX_RADIUS = 7000;   // outer boundary of the circular cloud
  const REPULSION = 150000;  // repulsion constant
  const ITERATIONS = 300;

  // Randomized circular start — gives a roughly spherical initial shape
  nodes.forEach((node, i) => {
    const angle = Math.random() * 2 * Math.PI;
    const r = Math.random() * MAX_RADIUS;
    node.x = Math.cos(angle) * r;
    node.y = Math.sin(angle) * r;
  });

  const forces: Array<[number, number]> = nodes.map(() => [0, 0]);

  for (let iter = 0; iter < ITERATIONS; iter++) {
    forces.forEach(f => { f[0] = 0; f[1] = 0; });

    // Pairwise repulsion — sampled for speed on large graphs
    const sampleRate = Math.max(1, Math.floor(n / 80));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j += sampleRate) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
        const force = REPULSION / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        forces[i][0] += fx; forces[i][1] += fy;
        forces[j][0] -= fx; forces[j][1] -= fy;
      }
    }

    const cooling = 1 - iter / ITERATIONS * 0.8;
    const damping = 0.7;

    nodes.forEach((node, i) => {
      node.x += forces[i][0] * damping * cooling;
      node.y += forces[i][1] * damping * cooling;

      // Soft circular boundary: push back if outside MAX_RADIUS
      const dist = Math.sqrt(node.x * node.x + node.y * node.y);
      if (dist > MAX_RADIUS) {
        const nx = node.x / dist;
        const ny = node.y / dist;
        node.x = nx * (MAX_RADIUS * 0.95 + Math.random() * MAX_RADIUS * 0.05);
        node.y = ny * (MAX_RADIUS * 0.95 + Math.random() * MAX_RADIUS * 0.05);
      }
    });
  }
}

/**
 * Render interactive graph as a self-contained HTML file using Sigma.js.
 * ~50KB total CDN load (graphology + sigma + forceatlas2).
 */
const GRAPH_UI: Record<string, Record<string, string>> = {
  zh: {
    graph: '关系图谱', nodes: '节点', edges: '边',
    loading: '加载图库中...', backToDocs: '返回文档', viewDoc: '查看文档',
    resetView: '重置视图', dragHint: '拖拽节点 · 滚轮缩放 · 点击查看详情',
    in: 'IN:', out: 'OUT:', none: '—',
    source: 'source', doc: 'doc',
    expandBtn: '展开 {n} 个关联代码节点', expandedBtn: '已展开 {n} 个节点',
  },
  en: {
    graph: 'Relationship Graph', nodes: 'nodes', edges: 'edges',
    loading: 'Loading graph...', backToDocs: 'Back to docs', viewDoc: 'View doc',
    resetView: 'Reset view', dragHint: 'Drag nodes · Scroll to zoom · Click for details',
    in: 'IN:', out: 'OUT:', none: '—',
    source: 'source', doc: 'doc',
    expandBtn: 'Expand {n} related nodes', expandedBtn: 'Expanded {n} nodes',
  },
};

function computeInitialNodeIds(data: GraphData): Set<string> {
  if (data.nodes.length <= 500) {
    return new Set(data.nodes.map(n => n.id));
  }

  const visible = new Set<string>();
  const nodeById = new Map(data.nodes.map(n => [n.id, n]));

  // 1. 所有 doc 节点
  for (const n of data.nodes) {
    if (n.type === 'doc') visible.add(n.id);
  }

  // 2. 与 doc 直接关联的 source 节点（通过 refers 边）
  for (const e of data.edges) {
    if (e.type === 'refers') {
      if (nodeById.get(e.from)?.type === 'source') visible.add(e.from);
      if (nodeById.get(e.to)?.type === 'source') visible.add(e.to);
    }
  }

  // 3. 从这些 source 节点 BFS 扩散 import 边
  let frontier = [...visible].filter(id => nodeById.get(id)?.type === 'source');

  while (visible.size < 500 && frontier.length > 0) {
    const nextFrontier: string[] = [];
    for (const nodeId of frontier) {
      const neighbors = data.edges
        .filter(e => e.type === 'import' && (e.from === nodeId || e.to === nodeId))
        .map(e => e.from === nodeId ? e.to : e.from)
        .filter(id => !visible.has(id) && nodeById.get(id)?.type === 'source');

      for (const nid of neighbors) {
        visible.add(nid);
        nextFrontier.push(nid);
        if (visible.size >= 500) break;
      }
      if (visible.size >= 500) break;
    }
    frontier = nextFrontier;
  }

  return visible;
}

export function renderSigma(data: GraphData, opts: { title?: string; lang?: string } = {}): string {
  const initialNodeIds = computeInitialNodeIds(data);
  const sigmaData = buildSigmaData(data, initialNodeIds);
  const lang = opts.lang || 'zh';
  const ui = GRAPH_UI[lang] || GRAPH_UI['en'];
  const t = (k: string) => ui[k] || k;

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t('graph')} · ${opts.title || 'nium-wiki'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #fff; overflow: hidden; font-family: monospace; }
    #chart { width: 100vw; height: 100vh; }
    #loading {
      position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
      background: #fff; color: #888; font-size: 14px; z-index: 999;
    }
    #home-btn {
      position: fixed; top: 16px; left: 16px; z-index: 100;
      display: inline-flex; align-items: center; gap: 4px;
      padding: 4px 10px; border-radius: 4px;
      border: 1px solid #ddd; background: #f8f8f8; color: #555;
      font-size: 12px; text-decoration: none; cursor: pointer;
    }
    #home-btn:hover { background: #eee; color: #333; }
    #title-bar {
      position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
      color: #333; font-size: 14px; z-index: 100; text-align: center;
      background: rgba(255,255,255,0.95); padding: 8px 16px; border-radius: 6px; border: 1px solid #ddd;
      white-space: nowrap;
    }
    #title-bar .sub { color: #888; font-size: 11px; margin-top: 4px; }
    #legend {
      position: fixed; top: 16px; right: 16px; color: #555; font-size: 11px;
      background: rgba(255,255,255,0.92); padding: 8px 12px; border-radius: 6px; border: 1px solid #ddd;
      z-index: 100;
    }
    #legend .item { margin: 2px 0; }
    #legend .dot { display:inline-block; width:8px; height:8px; border-radius:50%; vertical-align:middle; margin-right:6px; }
    #detail-panel {
      position: fixed; top: 80px; right: 16px; width: 320px;
      background: #fff; border: 1px solid #ddd; border-radius: 8px;
      padding: 18px; color: #333; font-size: 12px;
      display: none; box-shadow: 0 8px 24px rgba(0,0,0,0.12); z-index: 200;
      max-height: calc(100vh - 120px); overflow-y: auto;
    }
    #detail-panel .header { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
    #detail-panel .type-tag { font-size:10px; padding:2px 6px; border-radius:4px; font-weight:bold; }
    #detail-panel .close { background:none; border:none; color:#888; cursor:pointer; font-size:16px; line-height:1; }
    #detail-panel .name-row { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
    #detail-panel .name { font-size:14px; font-weight:bold; color:#111; word-break:break-all; flex:1; }
    #detail-panel .path { font-size:10px; color:#888; margin-bottom:12px; word-break:break-all; }
    #detail-panel .degrees { color:#666; margin-bottom:8px; }
    #detail-panel .label { color:#999; margin: 6px 0 4px; }
    #detail-panel .conn { margin: 2px 0; }
    #detail-panel .doc-link { flex-shrink:0; padding:2px 8px; border-radius:4px; border:1px solid #ddd; background:#f8f8f8; color:#333; font-size:11px; text-decoration:none; white-space:nowrap; }
    #detail-panel .doc-link:hover { background:#eee; }
    #toolbar {
      position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
      background: #fff; border: 1px solid #ddd; border-radius: 8px;
      padding: 6px 14px; display: flex; gap: 12px; align-items: center;
      font-size: 11px; color: #666; z-index: 100;
    }
    #toolbar button {
      background: #f0f0f0; border: none; color: #333; padding: 4px 10px;
      border-radius: 4px; cursor: pointer; font-family: monospace; font-size: 11px;
    }
    #toolbar button:hover { background: #e0e0e0; }
    #toolbar label { cursor: pointer; }
    #toolbar input[type=checkbox] { vertical-align: middle; }
    #toolbar .sep { color: #ddd; }
  </style>
</head>
<body>
  <div id="loading">${t('loading')}</div>
  <div id="chart"></div>
  <a id="home-btn" href="/">&#8592; ${t('backToDocs')}</a>
  <div id="title-bar">
    <div>${t('graph')} · <span id="visible-count">${initialNodeIds.size}</span> / ${data.nodes.length} ${t('nodes')} · ${data.edges.length} ${t('edges')}</div>
    <div class="sub">${opts.title || 'nium-wiki'} · ${t('dragHint')}</div>
  </div>
  <div id="legend">
    <div class="item"><span class="dot" style="background:#60a5fa"></span>${t('source')}</div>
    <div class="item"><span class="dot" style="background:#f59e0b"></span>${t('doc')}</div>
  </div>
  <div id="detail-panel">
    <div class="header">
      <span id="detail-type" class="type-tag"></span>
      <button class="close" onclick="document.getElementById('detail-panel').style.display='none'">×</button>
    </div>
    <div class="name-row">
      <div id="detail-name" class="name"></div>
      <a id="detail-doc-link" class="doc-link" style="display:none" href="#">${t('viewDoc')}</a>
    </div>
    <div id="detail-path" class="path"></div>
    <div id="detail-degrees" class="degrees"></div>
    <div id="detail-conns"></div>
  </div>
  <div id="toolbar">
    <label><input type="checkbox" id="f-source" checked> <span style="color:#60a5fa">${t('source')}</span></label>
    <label><input type="checkbox" id="f-doc" checked> <span style="color:#f59e0b">${t('doc')}</span></label>
    <span class="sep">|</span>
    <button id="btn-reset">${t('resetView')}</button>
  </div>

  <script>
    const __GRAPH_UI = ${JSON.stringify(ui)};
  </script>
  <script>
${loadVendorScript('graphology', 'dist/graphology.umd.min.js')}
  </script>
  <script>
${loadVendorScript('sigma', 'dist/sigma.min.js')}
  </script>
  <script>
    const __FULL_DATA = ${JSON.stringify(sigmaData)};
    const __INITIAL_NODES = new Set(${JSON.stringify([...initialNodeIds])});
    const edgeColors = ${JSON.stringify(EDGE_COLOR_HEX)};
    const typeColors = ${JSON.stringify(TYPE_COLOR_HEX)};
    let renderer, graph;
    let selectedNodeId = null;

    function buildGraph() {
      const Graph = graphology.Graph;
      const g = new Graph({ multi: true, type: 'directed' });
      for (const n of __FULL_DATA.nodes) {
        g.addNode(n.id, {
          label: n.label,
          fullPath: n.fullPath,
          nodeType: n.nodeType,
          size: n.size,
          color: n.color,
          inDegree: n.inDegree,
          outDegree: n.outDegree,
          x: n.x,
          y: n.y,
          hidden: !__INITIAL_NODES.has(n.id),
        });
      }
      for (let i = 0; i < __FULL_DATA.edges.length; i++) {
        const e = __FULL_DATA.edges[i];
        if (g.hasNode(e.source) && g.hasNode(e.target)) {
          const sH = g.getNodeAttribute(e.source, 'hidden');
          const tH = g.getNodeAttribute(e.target, 'hidden');
          g.addEdgeWithKey('e' + i, e.source, e.target, {
            edgeType: e.edgeType,
            color: e.color,
            size: e.size,
            type: 'arrow',
            hidden: sH || tH,
          });
        }
      }
      return g;
    }

    function expandNode(nodeId) {
      if (!graph || graph.getNodeAttribute(nodeId, 'nodeType') !== 'source') return 0;
      const unhidden = new Set();
      for (const e of __FULL_DATA.edges) {
        if (e.edgeType !== 'import') continue;
        if (e.source !== nodeId && e.target !== nodeId) continue;
        const neighborId = e.source === nodeId ? e.target : e.source;
        if (graph.hasNode(neighborId) && graph.getNodeAttribute(neighborId, 'hidden')) {
          graph.setNodeAttribute(neighborId, 'hidden', false);
          unhidden.add(neighborId);
        }
      }
      if (unhidden.size > 0) {
        graph.forEachEdge((eid, eattr, src, tgt) => {
          const sH = graph.getNodeAttribute(src, 'hidden');
          const tH = graph.getNodeAttribute(tgt, 'hidden');
          graph.setEdgeAttribute(eid, 'hidden', sH || tH);
        });
        renderer.refresh();
      }
      return unhidden.size;
    }

    function showDetail(nodeId) {
      const attr = graph.getNodeAttributes(nodeId);
      const panel = document.getElementById('detail-panel');
      const tColor = typeColors[attr.nodeType] || '#333';
      const typeEl = document.getElementById('detail-type');
      typeEl.textContent = attr.nodeType.toUpperCase();
      typeEl.style.background = tColor + '22';
      typeEl.style.color = tColor;
      document.getElementById('detail-name').textContent = attr.label;
      document.getElementById('detail-path').textContent = attr.fullPath;
      document.getElementById('detail-degrees').innerHTML =
        '<span style="color:#f59e0b">← ' + attr.inDegree + '</span> &nbsp;' +
        '<span style="color:#60a5fa">→ ' + attr.outDegree + '</span>';

      const docLink = document.getElementById('detail-doc-link');
      if (attr.nodeType === 'doc') {
        const docPath = attr.fullPath.replace(/\\.md$/, '');
        docLink.href = '/#/' + docPath;
        docLink.style.display = 'inline-block';
      } else {
        docLink.style.display = 'none';
      }

      const ins = __FULL_DATA.edges.filter(e => e.target === nodeId).map(e => {
        const src = graph.hasNode(e.source) ? graph.getNodeAttribute(e.source, 'label') : e.source;
        return '<div class="conn">&nbsp;&nbsp;← <span style="color:' + (edgeColors[e.edgeType] || '#64748b') + '">' + src + '</span> (' + e.edgeType + ')</div>';
      }).join('');
      const outs = __FULL_DATA.edges.filter(e => e.source === nodeId).map(e => {
        const tgt = graph.hasNode(e.target) ? graph.getNodeAttribute(e.target, 'label') : e.target;
        return '<div class="conn">&nbsp;&nbsp;→ <span style="color:' + (edgeColors[e.edgeType] || '#64748b') + '">' + tgt + '</span> (' + e.edgeType + ')</div>';
      }).join('');

      // Expand button for source nodes with hidden neighbors
      let expandBtn = '';
      if (attr.nodeType === 'source') {
        const hiddenNeighborIds = new Set(
          __FULL_DATA.edges
            .filter(e => e.edgeType === 'import' && (e.source === nodeId || e.target === nodeId))
            .map(e => e.source === nodeId ? e.target : e.source)
            .filter(id => graph.hasNode(id) && graph.getNodeAttribute(id, 'hidden'))
        );
        if (hiddenNeighborIds.size > 0) {
          expandBtn = '<button id="detail-expand" data-node-id="' + nodeId + '" style="margin-top:10px;padding:3px 10px;border-radius:4px;border:1px solid #ddd;background:#f8f8f8;color:#333;font-size:11px;cursor:pointer;font-family:inherit">' + __GRAPH_UI['expandBtn'].replace('{n}', hiddenNeighborIds.size) + '</button>';
        }
      }

      document.getElementById('detail-conns').innerHTML =
        '<div class="label">' + __GRAPH_UI['in'] + '</div>' + (ins || '<div style="color:#bbb;margin-left:8px">' + __GRAPH_UI['none'] + '</div>') +
        '<div class="label">' + __GRAPH_UI['out'] + '</div><div class="out-section">' + (outs || '<div style="color:#bbb;margin-left:8px">' + __GRAPH_UI['none'] + '</div>') + '</div>' +
        expandBtn;

      panel.style.display = 'block';
    }

    function applyFilters() {
      const visible = {
        source: document.getElementById('f-source').checked,
        doc: document.getElementById('f-doc').checked,
      };
      graph.forEachNode((id, attr) => {
        graph.setNodeAttribute(id, 'hidden', !visible[attr.nodeType]);
      });
      graph.forEachEdge((id, attr, src, tgt) => {
        const sH = graph.getNodeAttribute(src, 'hidden');
        const tH = graph.getNodeAttribute(tgt, 'hidden');
        graph.setEdgeAttribute(id, 'hidden', sH || tH);
      });
      renderer.refresh();
      updateVisibleCount();
    }

    window.addEventListener('load', function () {
      document.getElementById('loading').style.display = 'none';
      graph = buildGraph();

      var Sigma = window.sigma && window.sigma.Sigma ? window.sigma.Sigma : window.Sigma;

      function refreshSelection() {
        renderer.refresh({ hiddenGraph: false });
      }

      function updateVisibleCount() {
        let count = 0;
        graph.forEachNode((id, attr) => { if (!attr.hidden) count++; });
        document.getElementById('visible-count').textContent = count;
      }

      renderer = new Sigma(graph, document.getElementById('chart'), {
        renderEdgeLabels: false,
        defaultEdgeType: 'arrow',
        labelColor: { color: '#333' },
        labelSize: 11,
        labelFont: 'monospace',
        labelWeight: 'normal',
        labelDensity: 0.5,
        labelGridCellSize: 80,
        labelRenderedSizeThreshold: 4,
        nodeReducer: (nodeId, attr) => {
          if (attr.hidden) return attr;
          if (!selectedNodeId) return attr;
          const nodeType = graph.getNodeAttribute(nodeId, 'nodeType');
          const connected = graph.hasEdge(nodeId, selectedNodeId) || graph.hasEdge(selectedNodeId, nodeId);
          if (nodeId === selectedNodeId) {
            return { ...attr, borderColor: '#ffffff', borderWidth: 3, color: nodeType === 'doc' ? '#fde68a' : '#93c5fd', zIndex: 2 };
          } else if (connected) {
            return { ...attr, zIndex: 1 };
          } else {
            return { ...attr, color: '#e5e7eb', zIndex: 0 };
          }
        },
        edgeReducer: (edgeId, attr) => {
          if (!selectedNodeId) return attr;
          const [s, t] = graph.extremities(edgeId);
          if (s === selectedNodeId || t === selectedNodeId) {
            return { ...attr, color: '#60a5fa' };
          }
          return { ...attr, color: '#f3f4f6', hidden: true };
        },
      });

      // Drag support
      let draggedNode = null;
      let isDragging = false;
      renderer.on('downNode', (e) => {
        isDragging = true;
        draggedNode = e.node;
        graph.setNodeAttribute(draggedNode, 'highlighted', true);
      });
      renderer.getMouseCaptor().on('mousemovebody', (e) => {
        if (!isDragging || !draggedNode) return;
        const pos = renderer.viewportToGraph(e);
        graph.setNodeAttribute(draggedNode, 'x', pos.x);
        graph.setNodeAttribute(draggedNode, 'y', pos.y);
        e.preventSigmaDefault();
        e.original.preventDefault();
        e.original.stopPropagation();
      });
      const stopDrag = () => {
        if (draggedNode) graph.removeNodeAttribute(draggedNode, 'highlighted');
        isDragging = false;
        draggedNode = null;
      };
      renderer.getMouseCaptor().on('mouseup', stopDrag);
      renderer.getMouseCaptor().on('mouseleave', stopDrag);

      // Click → detail + selection
      renderer.on('clickNode', (e) => {
        selectedNodeId = e.node;
        showDetail(e.node);
        refreshSelection();
      });
      renderer.on('clickStage', () => {
        selectedNodeId = null;
        document.getElementById('detail-panel').style.display = 'none';
        refreshSelection();
      });

      // Expand button via event delegation — survives innerHTML replacement
      document.getElementById('detail-conns').addEventListener('click', function(e) {
        const btn = e.target.closest('#detail-expand');
        if (!btn || btn.disabled) return;
        const nodeId = btn.dataset.nodeId;
        if (!nodeId) return;
        const added = expandNode(nodeId);
        if (added > 0) {
          btn.textContent = __GRAPH_UI['expandedBtn'].replace('{n}', added);
          btn.disabled = true;
          btn.style.opacity = '0.6';
          refreshSelection();
          updateVisibleCount();
          // Update connections list to show newly visible neighbors (don't rebuild whole panel)
          const nodeType = graph.getNodeAttribute(nodeId, 'nodeType');
          const tColor = typeColors[nodeType] || '#333';
          const outs = __FULL_DATA.edges.filter(ed => ed.source === nodeId).map(ed => {
            const tgt = graph.hasNode(ed.target) ? graph.getNodeAttribute(ed.target, 'label') : ed.target;
            return '<div class="conn">&nbsp;&nbsp;→ <span style="color:' + (edgeColors[ed.edgeType] || '#94a3b8') + '">' + tgt + '</span> (' + ed.edgeType + ')</div>';
          }).join('');
          // Find the OUT section and update only it
          const connsEl = document.getElementById('detail-conns');
          const outSection = connsEl.querySelector('.out-section');
          if (outSection) outSection.innerHTML = outs || '<div style="color:#bbb;margin-left:8px">' + __GRAPH_UI['none'] + '</div>';
          // Remove expand button from dom since all neighbors are now visible
          btn.remove();
        }
      });

      // Filter checkboxes
      ['f-source', 'f-doc'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
          applyFilters();
          refreshSelection();
          updateVisibleCount();
        });
      });

      // Toolbar buttons
      document.getElementById('btn-reset').addEventListener('click', () => {
        renderer.getCamera().animatedReset();
      });
    });
  </script>
</body>
</html>`;
}

export interface RenderOptions {
  format?: OutputFormat;
  pathPrefix?: string;
  edgeTypes?: EdgeType[];
  nodeTypes?: NodeType[];
  maxNodes?: number;
  title?: string;
}

export function renderGraph(projectRoot: string, opts: RenderOptions = {}): string {
  const data = loadGraphData(projectRoot);
  const filtered = filterGraph(data, opts);

  switch (opts.format) {
    case 'svg':
      return renderSvg(filtered, { title: opts.title });
    case 'dot':
      return renderDot(filtered, { name: opts.title });
    case 'sigma':
      return renderSigma(filtered, { title: opts.title });
    default:
      return renderAscii(filtered);
  }
}
