import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDesign, createNode, insertNode, removeNode,
  createEdge, insertEdge, removeEdge, canRetargetEdge, retargetEdge, serializeDesign,
  findEdgeBetween, markEdgeBidirectional
} from '../js/design.js';

// Test helpers composing the pure builders with their insert commands the same
// way the app does.
function addNode(design, props) {
  const node = createNode(design, props);
  insertNode(design, node);
  return node;
}
function addEdge(design, from, to, label = '') {
  const edge = createEdge(design, { from, to, label });
  if (edge) insertEdge(design, edge);
  return edge;
}

test('createDesign starts empty and bound to a question', () => {
  const design = createDesign('url-shortener-aws');
  assert.equal(design.question, 'url-shortener-aws');
  assert.deepEqual(design.nodes, []);
  assert.deepEqual(design.edges, []);
});

test('createNode is pure: no mutation until insertNode applies it', () => {
  const design = createDesign('q');
  const node = createNode(design, { type: 'Lambda', label: 'Redirect', platform: 'AWS', x: 10, y: 20 });
  assert.equal(node.id, 'n1');
  assert.deepEqual(design.nodes, []); // untouched
  insertNode(design, node);
  assert.equal(design.nodes.length, 1);
});

test('create/insert node assigns sequential ids and stores fields', () => {
  const design = createDesign('q');
  const first = addNode(design, { type: 'Lambda', label: 'Redirect', platform: 'AWS', x: 10, y: 20 });
  const second = addNode(design, { type: 'DynamoDB', label: 'Store', platform: 'AWS', x: 30, y: 40 });
  assert.equal(first.id, 'n1');
  assert.equal(second.id, 'n2');
  assert.equal(design.nodes.length, 2);
  assert.equal(first.x, 10);
  assert.equal(first.type, 'Lambda');
});

test('create/insert edge connects two nodes and gets a unique id', () => {
  const design = createDesign('q');
  const a = addNode(design, { type: 'A', label: 'A', platform: 'AWS', x: 0, y: 0 });
  const b = addNode(design, { type: 'B', label: 'B', platform: 'AWS', x: 0, y: 0 });
  const edge = addEdge(design, a.id, b.id, 'read');
  assert.equal(edge.id, 'e3'); // shares the _seq counter with nodes
  assert.equal(edge.from, a.id);
  assert.equal(edge.to, b.id);
  assert.equal(edge.label, 'read');
});

test('removeNode also removes connected edges', () => {
  const design = createDesign('q');
  const a = addNode(design, { type: 'A', label: 'A', platform: 'AWS', x: 0, y: 0 });
  const b = addNode(design, { type: 'B', label: 'B', platform: 'AWS', x: 0, y: 0 });
  addEdge(design, a.id, b.id, '');
  removeNode(design, a.id);
  assert.equal(design.nodes.length, 1);
  assert.equal(design.edges.length, 0);
});

test('removeEdge removes only that edge', () => {
  const design = createDesign('q');
  const a = addNode(design, { type: 'A', label: 'A', platform: 'AWS', x: 0, y: 0 });
  const b = addNode(design, { type: 'B', label: 'B', platform: 'AWS', x: 0, y: 0 });
  const edge = addEdge(design, a.id, b.id, '');
  removeEdge(design, edge.id);
  assert.equal(design.edges.length, 0);
  assert.equal(design.nodes.length, 2);
});

test('serializeDesign strips coordinates and keeps semantic fields', () => {
  const design = createDesign('q');
  const a = addNode(design, { type: 'A', label: 'Alpha', platform: 'AWS', x: 5, y: 6 });
  const b = addNode(design, { type: 'B', label: 'Beta', platform: 'AWS', x: 7, y: 8 });
  addEdge(design, a.id, b.id, 'calls');
  assert.deepEqual(serializeDesign(design), {
    question: 'q',
    nodes: [
      { id: 'n1', type: 'A', label: 'Alpha', platform: 'AWS' },
      { id: 'n2', type: 'B', label: 'Beta', platform: 'AWS' }
    ],
    edges: [{ from: 'n1', to: 'n2', label: 'calls' }]
  });
});

test('createEdge refuses duplicates (either direction) and self-loops', () => {
  const design = createDesign('q');
  const a = addNode(design, { type: 'A', label: 'A', platform: 'AWS', x: 0, y: 0 });
  const b = addNode(design, { type: 'B', label: 'B', platform: 'AWS', x: 0, y: 0 });
  assert.ok(addEdge(design, a.id, b.id, ''));
  assert.equal(createEdge(design, { from: a.id, to: b.id }), null);  // same direction
  assert.equal(createEdge(design, { from: b.id, to: a.id }), null);  // reverse direction
  assert.equal(createEdge(design, { from: a.id, to: a.id }), null);  // self-loop
  assert.equal(design.edges.length, 1);
});

test('canRetargetEdge refuses self-loops and duplicates; retargetEdge then leaves the edge unchanged', () => {
  const design = createDesign('q');
  const a = addNode(design, { type: 'A', label: 'A', platform: 'AWS', x: 0, y: 0 });
  const b = addNode(design, { type: 'B', label: 'B', platform: 'AWS', x: 0, y: 0 });
  const c = addNode(design, { type: 'C', label: 'C', platform: 'AWS', x: 0, y: 0 });
  const edgeAB = addEdge(design, a.id, b.id, '');
  const edgeAC = addEdge(design, a.id, c.id, '');
  // re-pointing edgeAC's 'to' at b would duplicate edgeAB (a->b)
  const duplicate = { edgeId: edgeAC.id, end: 'to', targetNodeId: b.id };
  assert.equal(canRetargetEdge(design, duplicate), false);
  retargetEdge(design, duplicate);
  assert.equal(design.edges.find(e => e.id === edgeAC.id).to, c.id);
  // self-loop refused
  const selfLoop = { edgeId: edgeAB.id, end: 'to', targetNodeId: a.id };
  assert.equal(canRetargetEdge(design, selfLoop), false);
  retargetEdge(design, selfLoop);
  assert.equal(design.edges.find(e => e.id === edgeAB.id).to, b.id);
});

test('retargetEdge re-points the chosen end and ignores unknown edges', () => {
  const design = createDesign('q');
  const a = addNode(design, { type: 'A', label: 'A', platform: 'AWS', x: 0, y: 0 });
  const b = addNode(design, { type: 'B', label: 'B', platform: 'AWS', x: 0, y: 0 });
  const c = addNode(design, { type: 'C', label: 'C', platform: 'AWS', x: 0, y: 0 });
  const edge = addEdge(design, a.id, b.id, '');
  retargetEdge(design, { edgeId: edge.id, end: 'to', targetNodeId: c.id });
  assert.equal(design.edges[0].from, a.id);
  assert.equal(design.edges[0].to, c.id);
  retargetEdge(design, { edgeId: edge.id, end: 'from', targetNodeId: b.id });
  assert.equal(design.edges[0].from, b.id);
  assert.equal(canRetargetEdge(design, { edgeId: 'nope', end: 'to', targetNodeId: c.id }), false);
  retargetEdge(design, { edgeId: 'nope', end: 'to', targetNodeId: c.id }); // no-op, no throw
});

test('findEdgeBetween locates an edge in either direction and ignores a given edge', () => {
  const design = createDesign('q');
  const a = addNode(design, { type: 'A', label: 'A', platform: 'AWS', x: 0, y: 0 });
  const b = addNode(design, { type: 'B', label: 'B', platform: 'AWS', x: 0, y: 0 });
  const c = addNode(design, { type: 'C', label: 'C', platform: 'AWS', x: 0, y: 0 });
  const edge = addEdge(design, a.id, b.id, '');
  assert.equal(findEdgeBetween({ design, nodeAId: a.id, nodeBId: b.id }), edge);
  assert.equal(findEdgeBetween({ design, nodeAId: b.id, nodeBId: a.id }), edge); // reverse direction
  assert.equal(findEdgeBetween({ design, nodeAId: a.id, nodeBId: c.id }), null); // unconnected
  assert.equal(findEdgeBetween({ design, nodeAId: a.id, nodeBId: b.id, ignoreEdgeId: edge.id }), null);
});

test('markEdgeBidirectional flags the edge and serializeDesign carries it only when set', () => {
  const design = createDesign('q');
  const a = addNode(design, { type: 'A', label: 'Alpha', platform: 'AWS', x: 0, y: 0 });
  const b = addNode(design, { type: 'B', label: 'Beta', platform: 'AWS', x: 0, y: 0 });
  const c = addNode(design, { type: 'C', label: 'Gamma', platform: 'AWS', x: 0, y: 0 });
  const edgeAB = addEdge(design, a.id, b.id, 'calls');
  addEdge(design, b.id, c.id, 'reads');
  markEdgeBidirectional(design, edgeAB.id);
  assert.equal(edgeAB.bidirectional, true);
  markEdgeBidirectional(design, 'nope'); // unknown id is a no-op, no throw
  assert.deepEqual(serializeDesign(design).edges, [
    { from: 'n1', to: 'n2', label: 'calls', bidirectional: true },
    { from: 'n2', to: 'n3', label: 'reads' }
  ]);
});

test('serializeDesign includes description only when set, and never category', () => {
  const design = createDesign('q');
  addNode(design, { type: 'Lambda', label: 'Lambda', platform: 'AWS', x: 0, y: 0, description: 'Generates short codes', category: 'Compute' });
  addNode(design, { type: 'S3', label: 'S3', platform: 'AWS', x: 0, y: 0, category: 'Storage' }); // no description
  assert.deepEqual(serializeDesign(design).nodes, [
    { id: 'n1', type: 'Lambda', label: 'Lambda', platform: 'AWS', description: 'Generates short codes' },
    { id: 'n2', type: 'S3', label: 'S3', platform: 'AWS' }
  ]);
});
