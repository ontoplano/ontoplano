import type { Node, Edge } from '@xyflow/svelte';

export interface FilterState {
	showSupports: boolean;
	showContradicts: boolean;
	showEvidence: boolean;
	showPositive: boolean;
	showNegative: boolean;
	showNeutral: boolean;
}

export interface TraversalState {
	active: boolean;
	focusBeliefId: number | null;
	depth: number;
	savedViewport: { x: number; y: number; zoom: number } | null;
}

export const DEFAULT_FILTERS: FilterState = {
	showSupports: true,
	showContradicts: true,
	showEvidence: true,
	showPositive: true,
	showNegative: true,
	showNeutral: true
};

export function bfsNeighborhood(
	startNodeId: string,
	allNodes: Node[],
	allEdges: Edge[],
	maxDepth: number
): Set<string> {
	const visited = new Set<string>();
	const queue: Array<{ id: string; depth: number }> = [{ id: startNodeId, depth: 0 }];
	visited.add(startNodeId);

	const adjacency = new Map<string, string[]>();
	for (const node of allNodes) {
		adjacency.set(node.id, []);
	}
	for (const edge of allEdges) {
		adjacency.get(edge.source)?.push(edge.target);
		adjacency.get(edge.target)?.push(edge.source);
	}

	while (queue.length > 0) {
		const current = queue.shift()!;
		if (current.depth >= maxDepth) continue;

		const neighbors = adjacency.get(current.id) ?? [];
		for (const neighbor of neighbors) {
			if (!visited.has(neighbor)) {
				visited.add(neighbor);
				queue.push({ id: neighbor, depth: current.depth + 1 });
			}
		}
	}

	return visited;
}

export function applyFilters(
	nodes: Node[],
	edges: Edge[],
	filters: FilterState,
	traversal: TraversalState
): { nodes: Node[]; edges: Edge[] } {
	let visibleNodeIds: Set<string> | null = null;

	if (traversal.active && traversal.focusBeliefId !== null) {
		const focusNodeId = `b-${traversal.focusBeliefId}`;
		visibleNodeIds = bfsNeighborhood(focusNodeId, nodes, edges, traversal.depth);
	}

	const filteredNodes = nodes.map((node) => {
		let hidden = false;

		if (visibleNodeIds && !visibleNodeIds.has(node.id)) {
			hidden = true;
		}

		if (!hidden && node.type === 'belief') {
			const valence = (node.data.valence as string) ?? 'neutral';
			if (valence === 'positive' && !filters.showPositive) hidden = true;
			if (valence === 'negative' && !filters.showNegative) hidden = true;
			if (valence === 'neutral' && !filters.showNeutral) hidden = true;
		}

		if (!hidden && node.type === 'evidence' && !filters.showEvidence) {
			hidden = true;
		}

		return node.hidden === hidden ? node : { ...node, hidden };
	});

	const hiddenNodeIds = new Set(filteredNodes.filter((n) => n.hidden).map((n) => n.id));

	const filteredEdges = edges.map((edge) => {
		let hidden = false;

		if (hiddenNodeIds.has(edge.source) || hiddenNodeIds.has(edge.target)) {
			hidden = true;
		}

		if (!hidden) {
			const edgeType = edge.data?.type as string | undefined;
			if (edgeType === 'supports' && !filters.showSupports) hidden = true;
			if (edgeType === 'contradicts' && !filters.showContradicts) hidden = true;

			if (edge.id.startsWith('ev-') && !filters.showEvidence) hidden = true;
		}

		return edge.hidden === hidden ? edge : { ...edge, hidden };
	});

	return { nodes: filteredNodes, edges: filteredEdges };
}

export function serializeFilters(filters: FilterState): Record<string, boolean> {
	return { ...filters };
}

export function deserializeFilters(raw: Record<string, unknown>): FilterState {
	return {
		showSupports: raw.showSupports !== false,
		showContradicts: raw.showContradicts !== false,
		showEvidence: raw.showEvidence !== false,
		showPositive: raw.showPositive !== false,
		showNegative: raw.showNegative !== false,
		showNeutral: raw.showNeutral !== false
	};
}
