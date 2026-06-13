import { escapeHtml } from './util.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const SIDE_NORMALS = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };

export function computeBorderAnchor(rect, targetX, targetY) {
  const centerX = rect.x + rect.w / 2;
  const centerY = rect.y + rect.h / 2;
  const deltaX = targetX - centerX;
  const deltaY = targetY - centerY;
  if (deltaX === 0 && deltaY === 0) return { x: centerX, y: centerY, side: null };
  const halfWidth = rect.w / 2;
  const halfHeight = rect.h / 2;
  if (Math.abs(deltaX) / halfWidth >= Math.abs(deltaY) / halfHeight) {
    return deltaX >= 0
      ? { x: centerX + halfWidth, y: centerY, side: 'right' }
      : { x: centerX - halfWidth, y: centerY, side: 'left' };
  }
  return deltaY >= 0
    ? { x: centerX, y: centerY + halfHeight, side: 'bottom' }
    : { x: centerX, y: centerY - halfHeight, side: 'top' };
}

export function computeEdgeEndpoints(from, to) {
  const fromCenter = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
  const toCenter = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
  const startAnchor = computeBorderAnchor(from, toCenter.x, toCenter.y);
  const endAnchor = computeBorderAnchor(to, fromCenter.x, fromCenter.y);
  return {
    x1: startAnchor.x, y1: startAnchor.y,
    x2: endAnchor.x, y2: endAnchor.y,
    side1: startAnchor.side, side2: endAnchor.side
  };
}

export function buildEdgePath({ x1, y1, x2, y2, side1 = null, side2 = null }) {
  const deltaX = x2 - x1;
  const deltaY = y2 - y1;
  const easing = Math.min(100, Math.max(20, 0.4 * Math.hypot(deltaX, deltaY)));
  const horizontal = Math.abs(deltaX) >= Math.abs(deltaY);
  let c1x, c1y, c2x, c2y;
  if (SIDE_NORMALS[side1]) {
    const [normalX, normalY] = SIDE_NORMALS[side1];
    c1x = x1 + normalX * easing; c1y = y1 + normalY * easing;
  } else if (horizontal) { c1x = x1 + deltaX * 0.5; c1y = y1; }
  else { c1x = x1; c1y = y1 + deltaY * 0.5; }
  if (SIDE_NORMALS[side2]) {
    const [normalX, normalY] = SIDE_NORMALS[side2];
    c2x = x2 + normalX * easing; c2y = y2 + normalY * easing;
  } else if (horizontal) { c2x = x2 - deltaX * 0.5; c2y = y2; }
  else { c2x = x2; c2y = y2 - deltaY * 0.5; }
  const round = n => Math.round(n);
  return `M ${round(x1)} ${round(y1)} C ${round(c1x)} ${round(c1y)} ${round(c2x)} ${round(c2y)} ${round(x2)} ${round(y2)}`;
}

export function needsDescriptionNudge(node) {
  return node.category === 'Compute' && !node.description;
}

const REVIEW_GLYPHS = { good: '✓', warning: '!', problem: '✗' };


const TRASH_SVG =
  '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<polyline points="3 6 5 6 21 6"></polyline>' +
  '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>' +
  '</svg>';

export function createCanvas({ canvasEl, edgeSvg, design, deps, onChange = () => {}, onSelectNode = () => {} }) {
  const nodeEls = new Map(); // nodeId -> element
  let linkingFromNodeId = null; // nodeId while drawing a new edge
  let linkPreview = null;       // live preview <path> during a link drag
  let selectedEdgeId = null;    // currently selected edge (shows handles + ×)
  let edgeDrag = null;          // { edgeId, end, x, y } while dragging an endpoint
  let dropTargetId = null;      // node highlighted as the drop target during a drag
  const handleEls = [];         // HTML overlays (handles + ×) for the selected edge
  const edgeEls = new Map();    // edgeId -> { path, label } so drags can update in place


  const zoomLayer = canvasEl.parentElement;
  const sizer = zoomLayer.parentElement;
  const scroller = canvasEl.closest('.canvas-wrap');
  const CANVAS_W = canvasEl.offsetWidth || 2600;
  const CANVAS_H = canvasEl.offsetHeight || 1800;
  const MIN_ZOOM = 0.4, MAX_ZOOM = 2.5;
  let zoom = 1;

  function convertClientToCanvas(clientX, clientY) {
    const rect = canvasEl.getBoundingClientRect();
    return { x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom };
  }

  function applyZoom() {
    zoomLayer.style.transform = `scale(${zoom})`;
    sizer.style.width = CANVAS_W * zoom + 'px';
    sizer.style.height = CANVAS_H * zoom + 'px';
  }


  function setZoom(next, anchorX, anchorY) {
    next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    if (next === zoom) return;
    const before = convertClientToCanvas(anchorX, anchorY);
    zoom = next;
    applyZoom();
    const wrapRect = scroller.getBoundingClientRect();
    scroller.scrollLeft = before.x * zoom - (anchorX - wrapRect.left);
    scroller.scrollTop = before.y * zoom - (anchorY - wrapRect.top);
  }

  function handleWheelZoom(e) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setZoom(zoom * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
  }
  scroller.addEventListener('wheel', handleWheelZoom, { passive: false });
  applyZoom();

  function measureNode(node) {
    const el = nodeEls.get(node.id);
    return { x: node.x, y: node.y, w: el ? el.offsetWidth : 90, h: el ? el.offsetHeight : 36 };
  }

  const ENDPOINT_GAP = 7;
  function offsetBySide({ x, y, side }) {
    const normal = SIDE_NORMALS[side];
    return normal ? { x: x + normal[0] * ENDPOINT_GAP, y: y + normal[1] * ENDPOINT_GAP } : { x, y };
  }


  function computeEdgeRenderPoints(edge, from, to) {
    if (edgeDrag && edgeDrag.edgeId === edge.id) {
      const cursorX = edgeDrag.x, cursorY = edgeDrag.y;
      if (edgeDrag.end === 'to') {
        const anchor = computeBorderAnchor(measureNode(from), cursorX, cursorY);
        const gapped = offsetBySide(anchor);
        return { x1: gapped.x, y1: gapped.y, x2: cursorX, y2: cursorY, side1: anchor.side, side2: null };
      }
      const anchor = computeBorderAnchor(measureNode(to), cursorX, cursorY);
      const gapped = offsetBySide(anchor);
      return { x1: cursorX, y1: cursorY, x2: gapped.x, y2: gapped.y, side1: null, side2: anchor.side };
    }
    const endpoints = computeEdgeEndpoints(measureNode(from), measureNode(to));
    const gappedStart = offsetBySide({ x: endpoints.x1, y: endpoints.y1, side: endpoints.side1 });
    const gappedEnd = offsetBySide({ x: endpoints.x2, y: endpoints.y2, side: endpoints.side2 });
    return {
      x1: gappedStart.x, y1: gappedStart.y, x2: gappedEnd.x, y2: gappedEnd.y,
      side1: endpoints.side1, side2: endpoints.side2
    };
  }

  function computeEdgeGeometry(edge) {
    const from = design.nodes.find(node => node.id === edge.from);
    const to = design.nodes.find(node => node.id === edge.to);
    if (!from || !to) return null;
    return computeEdgeRenderPoints(edge, from, to);
  }

  function refreshEdge(edge) {
    const els = edgeEls.get(edge.id);
    if (!els) return;
    const points = computeEdgeGeometry(edge);
    if (!points) return;
    const pathD = buildEdgePath(points);
    els.path.setAttribute('d', pathD);
    if (els.hit) els.hit.setAttribute('d', pathD);
    if (els.label) {
      els.label.setAttribute('x', (points.x1 + points.x2) / 2);
      els.label.setAttribute('y', (points.y1 + points.y2) / 2 - 6);
    }
  }

  function redrawEdges() {
    edgeSvg.innerHTML = '';
    edgeEls.clear();
    linkPreview = null;
    const defs = document.createElementNS(SVG_NS, 'defs');
    defs.innerHTML =
      '<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
      '<path d="M0,0 L10,5 L0,10 z" fill="#94a3b8"/></marker>' +
      '<marker id="arrow-sel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
      '<path d="M0,0 L10,5 L0,10 z" fill="#2563eb"/></marker>';
    edgeSvg.appendChild(defs);
    for (const edge of design.edges) {
      const from = design.nodes.find(node => node.id === edge.from);
      const to = design.nodes.find(node => node.id === edge.to);
      if (!from || !to) continue;
      const selected = edge.id === selectedEdgeId;
      const points = computeEdgeRenderPoints(edge, from, to);
      const pathD = buildEdgePath(points);

      const hit = document.createElementNS(SVG_NS, 'path');
      hit.setAttribute('d', pathD);
      hit.setAttribute('fill', 'none');
      hit.setAttribute('stroke', 'transparent');
      hit.setAttribute('stroke-width', '18');
      hit.style.pointerEvents = 'stroke';
      hit.style.cursor = 'pointer';
      hit.style.touchAction = 'none';
      hit.addEventListener('pointerdown', ev => handleEdgePointerDown(ev, edge.id));
      hit.addEventListener('dblclick', ev => { ev.stopPropagation(); openEdgeLabelEditor(edge); });
      edgeSvg.appendChild(hit);

      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', pathD);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', selected ? '#2563eb' : '#94a3b8');
      path.setAttribute('stroke-width', selected ? '2.5' : '1.5');
      path.setAttribute('marker-end', selected ? 'url(#arrow-sel)' : 'url(#arrow)');
      path.style.pointerEvents = 'none';
      edgeSvg.appendChild(path);

      let labelText = null;
      if (edge.label) {
        labelText = document.createElementNS(SVG_NS, 'text');
        labelText.setAttribute('x', (points.x1 + points.x2) / 2);
        labelText.setAttribute('y', (points.y1 + points.y2) / 2 - 6);
        labelText.setAttribute('fill', '#94a3b8');
        labelText.setAttribute('font-size', '11');
        labelText.setAttribute('text-anchor', 'middle');
        labelText.style.pointerEvents = 'none';
        labelText.textContent = edge.label;
        edgeSvg.appendChild(labelText);
      }
      edgeEls.set(edge.id, { path, hit, label: labelText });
    }
    renderEdgeHandles();
  }

  function renderEdgeHandles() {
    for (const handle of handleEls) handle.remove();
    handleEls.length = 0;
    if (!selectedEdgeId) return;
    const edge = design.edges.find(candidate => candidate.id === selectedEdgeId);
    if (!edge) { selectedEdgeId = null; return; }
    const from = design.nodes.find(node => node.id === edge.from);
    const to = design.nodes.find(node => node.id === edge.to);
    if (!from || !to) return;
    const { x1, y1, x2, y2 } = computeEdgeRenderPoints(edge, from, to);

    const appendOverlay = (className, x, y) => {
      const overlay = document.createElement('div');
      overlay.className = className;
      overlay.style.left = x + 'px';
      overlay.style.top = y + 'px';
      canvasEl.appendChild(overlay);
      handleEls.push(overlay);
      return overlay;
    };

    const startHandle = appendOverlay('edge-handle', x1, y1);
    startHandle.addEventListener('pointerdown', ev => { ev.stopPropagation(); ev.preventDefault(); startEndpointDrag(edge.id, 'from'); });
    const endHandle = appendOverlay('edge-handle', x2, y2);
    endHandle.addEventListener('pointerdown', ev => { ev.stopPropagation(); ev.preventDefault(); startEndpointDrag(edge.id, 'to'); });

    if (edgeDrag) {
      const draggedHandle = edgeDrag.end === 'from' ? startHandle : endHandle;
      draggedHandle.style.pointerEvents = 'none';
      draggedHandle.classList.add('dragging');
    } else {
      const deleteButton = appendOverlay('edge-del', (x1 + x2) / 2, (y1 + y2) / 2);
      deleteButton.innerHTML = TRASH_SVG;
      deleteButton.title = 'Delete connection';
      deleteButton.addEventListener('pointerdown', ev => ev.stopPropagation());
      deleteButton.addEventListener('click', ev => { ev.stopPropagation(); removeSelectedEdge(); });
    }
  }

  function handleEdgePointerDown(ev, edgeId) {
    ev.stopPropagation();
    ev.preventDefault();
    const edge = design.edges.find(candidate => candidate.id === edgeId);
    if (!edge) return;
    selectEdge(edgeId);
    const points = computeEdgeGeometry(edge);
    if (!points) return;
    const { x: pointerX, y: pointerY } = convertClientToCanvas(ev.clientX, ev.clientY);
    const distanceToStart = Math.hypot(pointerX - points.x1, pointerY - points.y1);
    const distanceToEnd = Math.hypot(pointerX - points.x2, pointerY - points.y2);
    const GRAB_RADIUS = 24;
    if (distanceToEnd <= GRAB_RADIUS && distanceToEnd <= distanceToStart) startEndpointDrag(edgeId, 'to');
    else if (distanceToStart <= GRAB_RADIUS) startEndpointDrag(edgeId, 'from');
  }

  function selectEdge(id) {
    const activeEl = document.activeElement;
    if (activeEl && activeEl.classList && activeEl.classList.contains('node')) activeEl.blur();
    selectedEdgeId = id;
    redrawEdges();
  }

  function openEdgeLabelEditor(edge) {
    if (canvasEl.querySelector('.edge-label-editor')) return;
    const points = computeEdgeGeometry(edge);
    if (!points) return;
    const input = document.createElement('input');
    input.className = 'edge-label-editor';
    input.placeholder = 'label (optional)';
    input.value = edge.label || '';
    input.style.left = (points.x1 + points.x2) / 2 + 'px';
    input.style.top = (points.y1 + points.y2) / 2 + 'px';
    input.addEventListener('pointerdown', ev => ev.stopPropagation());
    canvasEl.appendChild(input);
    input.focus();
    input.select();

    let closed = false;
    function close() { if (closed) return; closed = true; input.remove(); }
    function apply() {
      if (closed) return;
      const nextLabel = input.value.trim();
      const changed = nextLabel !== (edge.label || '');
      close();
      if (changed) {
        edge.label = nextLabel;
        redrawEdges();
        onChange();
      }
    }
    input.addEventListener('keydown', ev => {
      ev.stopPropagation();
      if (ev.key === 'Enter') { ev.preventDefault(); apply(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); close(); }
    });
    input.addEventListener('blur', apply);
  }

  function deselectEdge() {
    if (selectedEdgeId !== null) { selectedEdgeId = null; redrawEdges(); }
  }

  function removeSelectedEdge() {
    if (!selectedEdgeId) return;
    deps.removeEdge(design, selectedEdgeId);
    selectedEdgeId = null;
    redrawEdges();
    onChange();
  }

  function findNodeIdUnderPointer(ev) {
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    const nodeEl = el && el.closest ? el.closest('.node') : null;
    return nodeEl ? nodeEl.dataset.id : null;
  }

  function setDropTarget(id) {
    if (dropTargetId === id) return;
    clearDropTarget();
    dropTargetId = id;
    if (id) { const el = nodeEls.get(id); if (el) el.classList.add('drop-target'); }
  }
  function clearDropTarget() {
    if (dropTargetId) { const el = nodeEls.get(dropTargetId); if (el) el.classList.remove('drop-target'); }
    dropTargetId = null;
  }

  function handleEndpointMove(ev) {
    const point = convertClientToCanvas(ev.clientX, ev.clientY);
    edgeDrag.x = point.x;
    edgeDrag.y = point.y;
    setDropTarget(findNodeIdUnderPointer(ev));
    const edge = design.edges.find(candidate => candidate.id === edgeDrag.edgeId);
    if (edge) refreshEdge(edge);
    renderEdgeHandles();
  }

  function stopEndpointListeners() {
    document.removeEventListener('pointermove', handleEndpointMove);
    document.removeEventListener('pointerup', handleEndpointUp);
    document.removeEventListener('pointercancel', handleEndpointCancel);
  }

  function handleEndpointCancel() {
    stopEndpointListeners();
    edgeDrag = null;
    clearDropTarget();
    redrawEdges();
  }

  function handleEndpointUp(ev) {
    stopEndpointListeners();
    const targetId = findNodeIdUnderPointer(ev);
    const { edgeId, end } = edgeDrag;
    edgeDrag = null;
    clearDropTarget();
    const edge = design.edges.find(candidate => candidate.id === edgeId);
    let changed = false;
    if (edge) {
      const otherEndNodeId = end === 'from' ? edge.to : edge.from;
      const currentNodeId = end === 'from' ? edge.from : edge.to;
      if (!targetId) {
        deps.removeEdge(design, edgeId);
        selectedEdgeId = null;
        changed = true;
      } else if (targetId !== otherEndNodeId && targetId !== currentNodeId) {
        const retarget = { edgeId, end, targetNodeId: targetId };
        changed = deps.canRetargetEdge(design, retarget);
        if (changed) deps.retargetEdge(design, retarget);
      }
    }
    redrawEdges();
    if (changed) onChange();
  }

  function startEndpointDrag(edgeId, end) {
    const edge = design.edges.find(candidate => candidate.id === edgeId);
    edgeDrag = { edgeId, end, x: 0, y: 0 };
    if (edge) {
      const from = design.nodes.find(node => node.id === edge.from);
      const to = design.nodes.find(node => node.id === edge.to);
      if (from && to) {
        const points = computeEdgeEndpoints(measureNode(from), measureNode(to)); // start at the current end
        edgeDrag.x = end === 'from' ? points.x1 : points.x2;
        edgeDrag.y = end === 'from' ? points.y1 : points.y2;
      }
    }
    document.addEventListener('pointermove', handleEndpointMove);
    document.addEventListener('pointerup', handleEndpointUp);
    document.addEventListener('pointercancel', handleEndpointCancel);
    redrawEdges();
  }

  function drawLinkPreview(ev) {
    const source = design.nodes.find(node => node.id === linkingFromNodeId);
    if (!source) return;
    const { x: cursorX, y: cursorY } = convertClientToCanvas(ev.clientX, ev.clientY);
    const anchor = computeBorderAnchor(measureNode(source), cursorX, cursorY);
    const gapped = offsetBySide(anchor);
    if (!linkPreview) {
      linkPreview = document.createElementNS(SVG_NS, 'path');
      linkPreview.setAttribute('class', 'link-preview');
      linkPreview.setAttribute('fill', 'none');
      edgeSvg.appendChild(linkPreview);
    }
    linkPreview.setAttribute('d', buildEdgePath({ x1: gapped.x, y1: gapped.y, x2: cursorX, y2: cursorY, side1: anchor.side, side2: null }));
    const hoveredNodeId = findNodeIdUnderPointer(ev);
    setDropTarget(hoveredNodeId && hoveredNodeId !== linkingFromNodeId ? hoveredNodeId : null);
  }

  function startLink(nodeId) {
    linkingFromNodeId = nodeId;
    const el = nodeEls.get(nodeId);
    if (el) el.classList.add('linking');
    document.addEventListener('pointermove', drawLinkPreview);
    document.addEventListener('pointerup', finishLink);
    document.addEventListener('pointercancel', cancelLink);
  }

  function finishLink(ev) {
    const fromId = linkingFromNodeId;
    const targetId = findNodeIdUnderPointer(ev);
    endLink();
    if (fromId && targetId && targetId !== fromId) {
      const edge = deps.createEdge(design, { from: fromId, to: targetId, label: '' });
      if (edge) {
        deps.insertEdge(design, edge);
        redrawEdges();
        onChange();
        openEdgeLabelEditor(edge);
      }
    }
  }

  function cancelLink() { endLink(); }

  function endLink() {
    if (linkingFromNodeId) {
      const el = nodeEls.get(linkingFromNodeId);
      if (el) el.classList.remove('linking');
    }
    document.removeEventListener('pointermove', drawLinkPreview);
    document.removeEventListener('pointerup', finishLink);
    document.removeEventListener('pointercancel', cancelLink);
    if (linkPreview) { linkPreview.remove(); linkPreview = null; }
    clearDropTarget();
    linkingFromNodeId = null;
  }

  function updateDescriptionDisplay(el, node) {
    const descriptionEl = el.querySelector('.node-desc');
    const nudgeEl = el.querySelector('.node-nudge');
    if (node.description) {
      descriptionEl.textContent = node.description;
      descriptionEl.style.display = '';
    } else {
      descriptionEl.textContent = '';
      descriptionEl.style.display = 'none';
    }
    nudgeEl.style.display = needsDescriptionNudge(node) ? '' : 'none';
  }

  function openDescriptionEditor(node, el) {
    if (el.querySelector('.node-editor')) return;
    const editor = document.createElement('textarea');
    editor.className = 'node-editor';
    editor.value = node.description || '';
    editor.placeholder = 'What does this do?';
    el.appendChild(editor);
    editor.focus();
    editor.select();

    let closed = false;
    function close() { if (closed) return; closed = true; editor.remove(); }
    function apply() {
      if (closed) return;
      node.description = editor.value.trim();
      updateDescriptionDisplay(el, node);
      close();
      onChange();
    }
    editor.addEventListener('keydown', ev => {
      ev.stopPropagation();
      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); apply(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); close(); }
    });
    editor.addEventListener('blur', apply);
    editor.addEventListener('pointerdown', ev => ev.stopPropagation());
    editor.addEventListener('click', ev => ev.stopPropagation());
  }

  function deleteNode(node, el) {
    deps.removeNode(design, node.id);
    el.remove();
    nodeEls.delete(node.id);
    redrawEdges();
    onChange();
  }

  function startNodeDrag(node, el, downEvent) {
    const pointerId = downEvent.pointerId;
    const startX = downEvent.clientX, startY = downEvent.clientY;
    const originX = node.x, originY = node.y;
    let dragged = false;
    function move(ev) {
      if (ev.pointerId !== pointerId) return;
      dragged = true;
      node.x = originX + (ev.clientX - startX) / zoom;
      node.y = originY + (ev.clientY - startY) / zoom;
      el.style.left = node.x + 'px';
      el.style.top = node.y + 'px';
      let selectedMoved = false;
      for (const edge of design.edges) {
        if (edge.from !== node.id && edge.to !== node.id) continue;
        refreshEdge(edge);
        if (edge.id === selectedEdgeId) selectedMoved = true;
      }
      if (selectedMoved) renderEdgeHandles();
    }
    function up(ev) {
      if (ev.pointerId !== pointerId) return;
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
    }
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
    return { wasDragged: () => dragged };
  }

  function createNodeElement(node) {
    const el = document.createElement('div');
    el.className = 'node';
    el.tabIndex = 0;
    el.dataset.id = node.id;
    el.style.left = node.x + 'px';
    el.style.top = node.y + 'px';
    el.innerHTML =
      `<span class="node-label">${escapeHtml(node.label)}</span>` +
      `<span class="node-type">${escapeHtml(node.type)} · ${escapeHtml(node.platform)}</span>` +
      `<span class="node-desc"></span>` +
      `<span class="node-nudge" title="Describe what this does">+ describe</span>` +
      `<span class="node-port port-top" data-side="top" title="Drag to connect"></span>` +
      `<span class="node-port port-right" data-side="right" title="Drag to connect"></span>` +
      `<span class="node-port port-bottom" data-side="bottom" title="Drag to connect"></span>` +
      `<span class="node-port port-left" data-side="left" title="Drag to connect"></span>` +
      `<span class="node-del" title="Delete node">${TRASH_SVG}</span>`;
    updateDescriptionDisplay(el, node);

    function isControlTarget(target) {
      return target.classList.contains('node-port') || target.classList.contains('node-del');
    }

    let activeDrag = null;

    el.addEventListener('pointerdown', e => {
      if (isControlTarget(e.target)) return;
      if (e.target.closest && e.target.closest('.node-editor')) return;
      deselectEdge();
      activeDrag = startNodeDrag(node, el, e);
    });

    el.addEventListener('click', e => {
      if (isControlTarget(e.target)) return;
      if (activeDrag && activeDrag.wasDragged()) { activeDrag = null; return; }
      el.focus();
      onSelectNode(node.id);
    });

    el.addEventListener('dblclick', e => {
      if (isControlTarget(e.target)) return;
      openDescriptionEditor(node, el);
    });
    el.querySelector('.node-nudge').addEventListener('click', e => {
      e.stopPropagation();
      openDescriptionEditor(node, el);
    });

    el.addEventListener('keydown', e => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteNode(node, el);
      }
    });

    el.querySelector('.node-del').addEventListener('click', () => deleteNode(node, el));

    el.querySelectorAll('.node-port').forEach(port => {
      port.addEventListener('pointerdown', e => {
        e.stopPropagation();
        e.preventDefault();
        startLink(node.id);
      });
    });

    nodeEls.set(node.id, el);
    return el;
  }

  function addComponentAt(component, x, y) {
    const node = deps.createNode(design, {
      type: component.type, label: component.type, platform: component.platform, x, y,
      category: component.category || ''
    });
    deps.insertNode(design, node);
    canvasEl.appendChild(createNodeElement(node));
    onChange();
  }

  const wrap = scroller;
  function handleWrapDragOver(e) { e.preventDefault(); }
  function handleWrapDrop(e) {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/json');
    if (!raw) return;
    const component = JSON.parse(raw);
    const point = convertClientToCanvas(e.clientX, e.clientY);
    addComponentAt(component, point.x - 40, point.y - 18);
  }

  function dropComponentAt(component, clientX, clientY) {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el || !wrap.contains(el)) return;
    const point = convertClientToCanvas(clientX, clientY);
    addComponentAt(component, point.x - 40, point.y - 18);
  }

  function isEmptyTarget(target) {
    return target === wrap || target === sizer || target === zoomLayer || target === edgeSvg;
  }

  const touchPoints = new Map();
  let lastPinchDist = null;

  function handleWrapPointerDown(e) {
    if (!isEmptyTarget(e.target)) return;
    deselectEdge();
    if (e.pointerType !== 'touch') return;
    touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lastPinchDist = null;
  }
  function handleWrapPointerMove(e) {
    if (!touchPoints.has(e.pointerId)) return;
    const prev = touchPoints.get(e.pointerId);
    touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touchPoints.size === 1) {
      scroller.scrollLeft -= e.clientX - prev.x;
      scroller.scrollTop -= e.clientY - prev.y;
    } else if (touchPoints.size === 2) {
      const [a, b] = [...touchPoints.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
      if (lastPinchDist) setZoom(zoom * dist / lastPinchDist, midX, midY);
      lastPinchDist = dist;
    }
  }
  function handleWrapPointerEnd(e) {
    touchPoints.delete(e.pointerId);
    lastPinchDist = null;
  }

  wrap.addEventListener('dragover', handleWrapDragOver);
  wrap.addEventListener('drop', handleWrapDrop);
  wrap.addEventListener('pointerdown', handleWrapPointerDown);
  wrap.addEventListener('pointermove', handleWrapPointerMove);
  wrap.addEventListener('pointerup', handleWrapPointerEnd);
  wrap.addEventListener('pointercancel', handleWrapPointerEnd);

  function handleDocumentKeydown(e) {
    if (!selectedEdgeId) return;
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) return;
    if (activeEl && activeEl.classList && activeEl.classList.contains('node')) return;
    e.preventDefault();
    removeSelectedEdge();
  }
  document.addEventListener('keydown', handleDocumentKeydown);

  function destroy() {
    document.removeEventListener('keydown', handleDocumentKeydown);
    stopEndpointListeners();
    document.removeEventListener('pointermove', drawLinkPreview);
    document.removeEventListener('pointerup', finishLink);
    document.removeEventListener('pointercancel', cancelLink);
    scroller.removeEventListener('wheel', handleWheelZoom);
    wrap.removeEventListener('dragover', handleWrapDragOver);
    wrap.removeEventListener('drop', handleWrapDrop);
    wrap.removeEventListener('pointerdown', handleWrapPointerDown);
    wrap.removeEventListener('pointermove', handleWrapPointerMove);
    wrap.removeEventListener('pointerup', handleWrapPointerEnd);
    wrap.removeEventListener('pointercancel', handleWrapPointerEnd);
  }

  function render() {
    canvasEl.innerHTML = '';
    nodeEls.clear();
    for (const node of design.nodes) canvasEl.appendChild(createNodeElement(node));
    redrawEdges();
  }

  function setSelected(nodeId) {
    for (const [id, el] of nodeEls) el.classList.toggle('selected', id === nodeId);
  }

  function setNodeReviews(reviewsById) {
    for (const [id, el] of nodeEls) {
      const oldBadge = el.querySelector('.node-badge');
      if (oldBadge) oldBadge.remove();
      const review = reviewsById[id];
      if (!review) continue;
      const badge = document.createElement('span');
      badge.className = `node-badge node-badge-${review.rating}`;
      badge.textContent = REVIEW_GLYPHS[review.rating] || '';
      el.appendChild(badge);
    }
  }

  function clearReviews() {
    for (const el of nodeEls.values()) {
      const badge = el.querySelector('.node-badge');
      if (badge) badge.remove();
      el.classList.remove('selected');
    }
  }

  return { render, redrawEdges, setSelected, setNodeReviews, clearReviews, dropComponentAt, destroy };
}
