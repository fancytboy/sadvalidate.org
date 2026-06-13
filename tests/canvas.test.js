import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeEdgeEndpoints, computeBorderAnchor, buildEdgePath, needsDescriptionNudge } from '../js/canvas.js';

test('needsDescriptionNudge only nudges compute nodes without a description', () => {
  assert.equal(needsDescriptionNudge({ category: 'Compute', description: '' }), true);
  assert.equal(needsDescriptionNudge({ category: 'Compute', description: 'does X' }), false);
  assert.equal(needsDescriptionNudge({ category: 'Storage', description: '' }), false);
  assert.equal(needsDescriptionNudge({ category: '', description: '' }), false);
});

test('computeBorderAnchor returns the centre of the side facing the target, with the side name', () => {
  const rect = { x: 0, y: 0, w: 100, h: 40 }; // centre (50, 20), hw 50, hh 20
  assert.deepEqual(computeBorderAnchor(rect, 500, 20), { x: 100, y: 20, side: 'right' });
  assert.deepEqual(computeBorderAnchor(rect, 50, 500), { x: 50, y: 40, side: 'bottom' });
  assert.deepEqual(computeBorderAnchor(rect, 50, 20), { x: 50, y: 20, side: null }); // centre
});

test('computeBorderAnchor snaps to a side centre on the diagonal (does not slide)', () => {
  const rect = { x: 0, y: 0, w: 100, h: 40 }; // centre (50, 20), hw 50, hh 20
  assert.deepEqual(computeBorderAnchor(rect, 300, 200), { x: 50, y: 40, side: 'bottom' });
  assert.deepEqual(computeBorderAnchor(rect, 1000, 30), { x: 100, y: 20, side: 'right' });
  assert.deepEqual(computeBorderAnchor(rect, 20, -300), { x: 50, y: 0, side: 'top' });
});

test('computeEdgeEndpoints anchors both ends to the facing sides (horizontal)', () => {
  const from = { x: 0, y: 0, w: 100, h: 40 };   // center (50, 20)
  const to = { x: 200, y: 0, w: 100, h: 40 };    // center (250, 20)
  assert.deepEqual(computeEdgeEndpoints(from, to), { x1: 100, y1: 20, x2: 200, y2: 20, side1: 'right', side2: 'left' });
});

test('computeEdgeEndpoints adapts to a vertical layout', () => {
  const from = { x: 0, y: 0, w: 100, h: 40 };    // center (50, 20)
  const to = { x: 0, y: 200, w: 100, h: 40 };     // center (50, 220)
  assert.deepEqual(computeEdgeEndpoints(from, to), { x1: 50, y1: 40, x2: 50, y2: 200, side1: 'bottom', side2: 'top' });
});

test('buildEdgePath with sides eases each end perpendicular to its anchored side', () => {
  // right -> left, dist 100 => easing 40
  assert.equal(buildEdgePath({ x1: 100, y1: 20, x2: 200, y2: 20, side1: 'right', side2: 'left' }), 'M 100 20 C 140 20 160 20 200 20');
  // bottom -> top, dist 160 => easing 64
  assert.equal(buildEdgePath({ x1: 50, y1: 40, x2: 50, y2: 200, side1: 'bottom', side2: 'top' }), 'M 50 40 C 50 104 50 136 50 200');
});

test('arrow points INTO the face: a top-anchored end approaches from above even when the delta is horizontal', () => {
  // start on a right side, end on a TOP side, horizontally-dominant delta
  const path = buildEdgePath({ x1: 100, y1: 20, x2: 300, y2: 60, side1: 'right', side2: 'top' });
  const nums = path.match(/-?\d+(\.\d+)?/g).map(Number);
  const [c2x, c2y, x2, y2] = nums.slice(-4);
  assert.equal(c2x, x2, 'final control point sits directly above the endpoint');
  assert.ok(c2y < y2, 'approach comes from above, so the arrow tangent points downward');
});

test('buildEdgePath without sides falls back to dominant-axis easing (link preview)', () => {
  assert.equal(buildEdgePath({ x1: 100, y1: 20, x2: 200, y2: 20 }), 'M 100 20 C 150 20 150 20 200 20');
  assert.equal(buildEdgePath({ x1: 50, y1: 40, x2: 50, y2: 200 }), 'M 50 40 C 50 120 50 120 50 200');
});
