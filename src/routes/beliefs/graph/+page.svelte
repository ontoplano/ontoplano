<script lang="ts">
	import {
		SvelteFlow,
		Controls,
		Background,
		BackgroundVariant,
		MiniMap,
		MarkerType,
		Position,
		type Node,
		type Edge,
		type NodeTypes,
		type EdgeTypes,
		type Connection
	} from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';
	import dagre from '@dagrejs/dagre';
	import type { PageServerData } from './$types';
	import BeliefNode from './BeliefNode.svelte';
	import EvidenceNode from './EvidenceNode.svelte';
	import RelationEdge from './RelationEdge.svelte';

	let { data }: { data: PageServerData } = $props();

	const nodeTypes: NodeTypes = {
		belief: BeliefNode,
		evidence: EvidenceNode
	};

	const edgeTypes: EdgeTypes = {
		relation: RelationEdge
	};

	let pendingRelations: Array<{
		source: number;
		target: number;
		type: 'supports' | 'contradicts';
		edgeId: string;
	}> = $state([]);

	let typePicker: {
		edgeId: string;
		sourceId: number;
		targetId: number;
		x: number;
		y: number;
	} | null = $state(null);

	function handleEdgeDeleteFromLabel(edgeId: string, relationId?: number) {
		if (relationId) {
			deleteRelation(relationId);
		} else {
			pendingRelations = pendingRelations.filter((r) => r.edgeId !== edgeId);
			edges = edges.filter((e) => e.id !== edgeId);
		}
	}

	async function updateBeliefContent(beliefId: number, content: string) {
		const body = new URLSearchParams({ id: String(beliefId), content });
		await fetch('?/updateBelief', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: body.toString()
		});
		nodes = nodes.map((n) =>
			n.id === `b-${beliefId}` ? { ...n, data: { ...n.data, label: content } } : n
		);
	}

	function buildInitialElements(): { nodes: Node[]; edges: Edge[] } {
		const nodes: Node[] = [];
		const edges: Edge[] = [];

		for (const belief of data.beliefs) {
			nodes.push({
				id: `b-${belief.id}`,
				type: 'belief',
				data: {
					beliefId: belief.id,
					label: belief.content,
					valence: belief.valence ?? 'neutral',
					onUpdate: updateBeliefContent
				},
				position: { x: 0, y: 0 }
			});
		}

		for (const ev of data.evidence) {
			nodes.push({
				id: `e-${ev.id}`,
				type: 'evidence',
				data: { label: ev.content },
				position: { x: 0, y: 0 }
			});
		}

		for (const rel of data.relations) {
			edges.push({
				id: `rel-${rel.id}`,
				source: `b-${rel.sourceBeliefId}`,
				target: `b-${rel.targetBeliefId}`,
				type: 'relation',
				data: {
					type: rel.type,
					relationId: rel.id,
					pending: false,
					onDelete: handleEdgeDeleteFromLabel
				},
				markerEnd: {
					type: MarkerType.ArrowClosed,
					color: rel.type === 'supports' ? '#22c55e' : '#ef4444'
				}
			});
		}

		for (const link of data.beliefEvidence) {
			edges.push({
				id: `ev-${link.id}`,
				source: `e-${link.evidenceId}`,
				target: `b-${link.beliefId}`,
				type: 'relation',
				data: { type: link.type, pending: false, onDelete: handleEdgeDeleteFromLabel },
				markerEnd: {
					type: MarkerType.ArrowClosed,
					color: link.type === 'supports' ? '#22c55e' : '#ef4444'
				}
			});
		}

		return { nodes, edges };
	}

	function layoutElements(nodes: Node[], edges: Edge[]): Node[] {
		const g = new dagre.graphlib.Graph();
		g.setDefaultEdgeLabel(() => ({}));
		g.setGraph({ rankdir: 'TB', nodesep: 80, ranksep: 100 });

		const nodeWidth = 260;
		const nodeHeight = 80;

		for (const node of nodes) {
			g.setNode(node.id, { width: nodeWidth, height: nodeHeight });
		}

		for (const edge of edges) {
			g.setEdge(edge.source, edge.target);
		}

		dagre.layout(g);

		return nodes.map((node) => {
			const pos = g.node(node.id);
			return {
				...node,
				position: {
					x: pos.x - nodeWidth / 2,
					y: pos.y - nodeHeight / 2
				}
			};
		});
	}

	const initial = buildInitialElements();
	let nodes = $state.raw<Node[]>(layoutElements(initial.nodes, initial.edges));
	let edges = $state.raw<Edge[]>(initial.edges);

	function onconnect(connection: Connection) {
		const sourceId = connection.source;
		const targetId = connection.target;

		if (!sourceId?.startsWith('b-') || !targetId?.startsWith('b-')) return;
		if (sourceId === targetId) return;

		const edgeId = `pending-${Date.now()}`;
		const sourceBeliefId = parseInt(sourceId.replace('b-', ''));
		const targetBeliefId = parseInt(targetId.replace('b-', ''));

		typePicker = {
			edgeId,
			sourceId: sourceBeliefId,
			targetId: targetBeliefId,
			x: 0,
			y: 0
		};

		const container = document.querySelector('.svelte-flow');
		if (container) {
			const rect = container.getBoundingClientRect();
			typePicker.x = rect.width / 2;
			typePicker.y = rect.height / 2;
		}
	}

	function selectType(type: 'supports' | 'contradicts') {
		if (!typePicker) return;

		const { edgeId, sourceId, targetId } = typePicker;

		pendingRelations = [...pendingRelations, { source: sourceId, target: targetId, type, edgeId }];

		const newEdge: Edge = {
			id: edgeId,
			source: `b-${sourceId}`,
			target: `b-${targetId}`,
			type: 'relation',
			data: { type, pending: true, onDelete: handleEdgeDeleteFromLabel },
			markerEnd: {
				type: MarkerType.ArrowClosed,
				color: type === 'supports' ? '#22c55e' : '#ef4444'
			}
		};
		edges = [...edges, newEdge];

		typePicker = null;
	}

	function cancelTypePicker() {
		typePicker = null;
	}

	function handleEdgesDelete(deletedEdges: Edge[]) {
		for (const edge of deletedEdges) {
			const relationId = edge.data?.relationId;
			if (relationId) {
				deleteRelation(Number(relationId));
			} else {
				pendingRelations = pendingRelations.filter((r) => r.edgeId !== edge.id);
			}
		}
	}

	async function deleteRelation(id: number) {
		const body = new URLSearchParams({ id: String(id) });
		await fetch('?/removeRelation', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: body.toString()
		});
		window.location.reload();
	}

	async function saveRelations() {
		for (const rel of pendingRelations) {
			const body = new URLSearchParams({
				sourceBeliefId: String(rel.source),
				targetBeliefId: String(rel.target),
				type: rel.type
			});
			await fetch('?/addRelation', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: body.toString()
			});
		}
		window.location.reload();
	}

	function isValidConnection(connection: Connection): boolean {
		const { source, target } = connection;
		if (!source?.startsWith('b-') || !target?.startsWith('b-')) return false;
		if (source === target) return false;
		return true;
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-lg font-bold text-gray-900">Belief Graph</h1>
		<div class="flex items-center gap-3">
			{#if pendingRelations.length > 0}
				<span class="text-sm text-gray-500">{pendingRelations.length} pending</span>
				<button
					onclick={saveRelations}
					class="bg-gray-900 px-3 py-1 text-sm text-white hover:bg-gray-800"
				>
					Save ({pendingRelations.length})
				</button>
			{/if}
			<a
				href="/beliefs"
				class="border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50"
			>
				&larr; Back to list
			</a>
		</div>
	</div>

	{#if data.beliefs.length === 0}
		<div class="border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
			No beliefs yet. <a href="/beliefs" class="text-gray-900 underline">Add one</a> to see the graph.
		</div>
	{:else}
		<div
			class="relative border border-gray-200 shadow-sm"
			style="width: 100%; height: calc(100vh - 120px);"
		>
			<SvelteFlow
				bind:nodes
				bind:edges
				{nodeTypes}
				{edgeTypes}
				{onconnect}
				{isValidConnection}
				onedgesdelete={handleEdgesDelete}
				fitView
				deleteKey="Delete"
				minZoom={0.3}
				maxZoom={3}
			>
				<Controls />
				<Background variant={BackgroundVariant.Dots} />
				<MiniMap />
			</SvelteFlow>

			{#if typePicker}
				<div
					class="absolute z-50 flex flex-col gap-2 border border-gray-200 bg-white p-3 shadow-sm"
					style="left: {typePicker.x}px; top: {typePicker.y}px; transform: translate(-50%, -50%);"
				>
					<span class="text-xs font-medium text-gray-600">Relation type:</span>
					<div class="flex gap-2">
						<button
							onclick={() => selectType('supports')}
							class="px-3 py-1 text-xs"
							style="background-color: #f0fdf4; color: #16a34a; border: 1px solid #86efac;"
						>
							Supports
						</button>
						<button
							onclick={() => selectType('contradicts')}
							class="px-3 py-1 text-xs"
							style="background-color: #fef2f2; color: #dc2626; border: 1px solid #fca5a5;"
						>
							Contradicts
						</button>
					</div>
					<button onclick={cancelTypePicker} class="text-xs text-gray-400 hover:text-gray-600">
						Cancel
					</button>
				</div>
			{/if}
		</div>
	{/if}

	<div class="text-xs text-gray-400">
		Drag from a handle to connect beliefs. Hover an edge label and click &times; to remove it.
		Double-click a belief to edit its text.
	</div>
</div>

<style>
	:global(.svelte-flow) {
		background: white;
	}

	:global(.svelte-flow__node) {
		border-radius: 0 !important;
	}

	:global(.svelte-flow__minimap) {
		border-radius: 0 !important;
	}

	:global(.svelte-flow__controls) {
		border-radius: 0 !important;
	}

	:global(.svelte-flow__controls button) {
		border-radius: 0 !important;
	}
</style>
