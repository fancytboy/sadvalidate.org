
export function createDesign(questionId) {
  return { question: questionId, nodes: [], edges: [], _seq: 0 };
}

function deriveNextId(design, prefix) {
  return prefix + (design._seq + 1);
}

export function createNode(design, { type, label, platform, x, y, description = '', category = '' }) {
  return { id: deriveNextId(design, 'n'), type, label, platform, x, y, description, category };
}

export function insertNode(design, node) {
  design._seq += 1;
  design.nodes.push(node);
}

export function removeNode(design, nodeId) {
  design.nodes = design.nodes.filter(node => node.id !== nodeId);
  design.edges = design.edges.filter(edge => edge.from !== nodeId && edge.to !== nodeId);
}

function areNodesLinked({ design, nodeAId, nodeBId, ignoreEdgeId = null }) {
  return design.edges.some(edge => edge.id !== ignoreEdgeId &&
    ((edge.from === nodeAId && edge.to === nodeBId) || (edge.from === nodeBId && edge.to === nodeAId)));
}

export function createEdge(design, { from, to, label = '' }) {
  if (from === to || areNodesLinked({ design, nodeAId: from, nodeBId: to })) return null;
  return { id: deriveNextId(design, 'e'), from, to, label };
}

export function insertEdge(design, edge) {
  design._seq += 1;
  design.edges.push(edge);
}

export function removeEdge(design, edgeId) {
  design.edges = design.edges.filter(edge => edge.id !== edgeId);
}

export function canRetargetEdge(design, { edgeId, end, targetNodeId }) {
  const edge = design.edges.find(candidate => candidate.id === edgeId);
  if (!edge) return false;
  const otherEndNodeId = end === 'from' ? edge.to : edge.from;
  if (targetNodeId === otherEndNodeId) return false;
  return !areNodesLinked({ design, nodeAId: targetNodeId, nodeBId: otherEndNodeId, ignoreEdgeId: edgeId });
}

export function retargetEdge(design, { edgeId, end, targetNodeId }) {
  if (!canRetargetEdge(design, { edgeId, end, targetNodeId })) return;
  const edge = design.edges.find(candidate => candidate.id === edgeId);
  if (end === 'from') edge.from = targetNodeId;
  else if (end === 'to') edge.to = targetNodeId;
}

export function serializeDesign(design) {
  return {
    question: design.question,
    nodes: design.nodes.map(node => {
      const out = { id: node.id, type: node.type, label: node.label, platform: node.platform };
      if (node.description) out.description = node.description;
      return out;
    }),
    edges: design.edges.map(({ from, to, label }) => ({ from, to, label }))
  };
}
