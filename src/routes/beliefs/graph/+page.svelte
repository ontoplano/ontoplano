<script lang="ts">
	import type { PageServerData } from './$types';
	import { onMount } from 'svelte';
	import type { Core, ElementDefinition, NodeSingular, EdgeSingular } from 'cytoscape';

	let { data }: { data: PageServerData } = $props();

	let container: HTMLDivElement = $state(null!);

	// Pending relations pending save
	let pendingRelations: Array<{
		source: number;
		target: number;
		type: 'supports' | 'contradicts';
		tempId: string;
	}> = $state([]);

	// Type picker state
	let typePicker: { tempId: string; x: number; y: number } | null = $state(null);

	// Selected edge for deletion
	let selectedEdge: EdgeSingular | null = $state(null);

	// Track the cytoscape instance
	let cyInstance: Core | null = $state(null);

	onMount(async () => {
		const cytoscape = (await import('cytoscape')).default;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const edgehandles = (await import('cytoscape-edgehandles')) as any;

		// Register edgehandles once
		if (!cytoscape.prototype.edgehandles) {
			cytoscape.use(edgehandles);
		}

		const elements: ElementDefinition[] = [];

		// Add belief nodes with valence
		for (const belief of data.beliefs) {
			elements.push({
				data: {
					id: `b-${belief.id}`,
					label: belief.content,
					valence: belief.valence ?? 'neutral'
				}
			});
		}

		// Add evidence nodes
		for (const ev of data.evidence) {
			elements.push({
				data: { id: `e-${ev.id}`, label: ev.content }
			});
		}

		// Add belief relation edges with relationId for deletion
		for (const rel of data.relations) {
			elements.push({
				data: {
					source: `b-${rel.sourceBeliefId}`,
					target: `b-${rel.targetBeliefId}`,
					label: rel.type,
					type: rel.type,
					relationId: rel.id
				}
			});
		}

		// Add evidence links
		for (const link of data.beliefEvidence) {
			elements.push({
				data: {
					source: `e-${link.evidenceId}`,
					target: `b-${link.beliefId}`,
					label: link.type,
					type: link.type
				}
			});
		}

		const cy = cytoscape({
			container,
			elements,
			style: [
				{
					selector: 'node',
					style: {
						label: 'data(label)',
						'text-wrap': 'wrap',
						'text-max-width': '250px',
						width: 'label',
						height: 'label',
						padding: '14px',
						shape: 'roundrectangle',
						'background-color': '#f9fafb',
						'border-width': 1,
						'border-color': '#d1d5db',
						'font-size': '13px',
						'text-valign': 'center',
						'text-halign': 'center'
					}
				},
				{
					selector: 'node[valence = "positive"]',
					style: {
						'background-color': '#f0fdf4',
						'border-color': '#86efac'
					}
				},
				{
					selector: 'node[valence = "negative"]',
					style: {
						'background-color': '#fef2f2',
						'border-color': '#fca5a5'
					}
				},
				{
					selector: 'node[valence = "neutral"]',
					style: {
						'background-color': '#f9fafb',
						'border-color': '#d1d5db'
					}
				},
				{
					selector: 'node[id ^= "e-"]',
					style: {
						'background-color': '#fefce8',
						'border-color': '#fde68a',
						'font-size': '11px'
					}
				},
				{
					selector: 'edge[type = "supports"]',
					style: {
						'line-color': '#22c55e',
						'target-arrow-color': '#22c55e',
						label: 'data(label)',
						'font-size': '9px',
						color: '#22c55e',
						'curve-style': 'bezier',
						'target-arrow-shape': 'triangle',
						'arrow-scale': 0.8,
						width: 1.5,
						'text-rotation': 'autorotate'
					}
				},
				{
					selector: 'edge[type = "contradicts"]',
					style: {
						'line-color': '#ef4444',
						'target-arrow-color': '#ef4444',
						label: 'data(label)',
						'font-size': '9px',
						color: '#ef4444',
						'curve-style': 'bezier',
						'target-arrow-shape': 'triangle',
						'arrow-scale': 0.8,
						width: 1.5,
						'text-rotation': 'autorotate'
					}
				},
				// Pending edge styles
				{
					selector: '.pending[type = "supports"]',
					style: {
						'line-color': '#22c55e',
						'target-arrow-color': '#22c55e',
						'line-style': 'dashed',
						'curve-style': 'bezier',
						'target-arrow-shape': 'triangle',
						'arrow-scale': 0.8,
						width: 1.5
					}
				},
				{
					selector: '.pending[type = "contradicts"]',
					style: {
						'line-color': '#ef4444',
						'target-arrow-color': '#ef4444',
						'line-style': 'dashed',
						'curve-style': 'bezier',
						'target-arrow-shape': 'triangle',
						'arrow-scale': 0.8,
						width: 1.5
					}
				},
				// Ghost edge styles for edgehandles preview
				{
					selector: '.eh-ghost-edge',
					style: {
						'line-color': '#9ca3af',
						'line-style': 'dashed',
						width: 1.5,
						'target-arrow-shape': 'triangle',
						'target-arrow-color': '#9ca3af',
						'curve-style': 'bezier'
					}
				},
				{
					selector: '.eh-preview',
					style: {
						'line-color': '#9ca3af',
						'line-style': 'dashed',
						width: 1.5,
						'target-arrow-shape': 'triangle',
						'target-arrow-color': '#9ca3af',
						'curve-style': 'bezier'
					}
				},
				// Edgehandles handle node style
				{
					selector: '.eh-handle',
					style: {
						'background-color': '#6b7280',
						width: 8,
						height: 8,
						shape: 'ellipse'
					}
				}
			],
			layout: {
				name: 'cose',
				animate: false,
				padding: 40,
				nodeRepulsion: function () {
					return 8000;
				},
				idealEdgeLength: function () {
					return 120;
				},
				edgeElasticity: function () {
					return 100;
				}
			},
			minZoom: 0.3,
			maxZoom: 3,
			wheelSensitivity: 0.3
		});

		// Initialize edgehandles - only allow belief-to-belief edges
		// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
		const _eh = (cy as any).edgehandles({
			canConnect: (src: NodeSingular, tgt: NodeSingular) => {
				return !src.same(tgt) && src.id().startsWith('b-') && tgt.id().startsWith('b-');
			},
			edgeParams: () => ({})
		});

		// Store instance for use in event handlers
		cyInstance = cy;

		// Handle edge creation completion
		cy.on('ehcomplete', (_evt: unknown, sourceNode: NodeSingular, targetNode: NodeSingular) => {
			// Remove the auto-created edge (we'll create our own with proper styling)
			const lastEdge = cy.edges().last();
			if (lastEdge.length > 0) {
				lastEdge.remove();
			}

			// Parse belief IDs from node ids
			const sourceId = parseInt(sourceNode.id().replace('b-', ''));
			const targetId = parseInt(targetNode.id().replace('b-', ''));

			// Generate temp ID
			const tempId = `temp-${Date.now()}`;

			// Add to pending relations
			pendingRelations = [
				...pendingRelations,
				{
					source: sourceId,
					target: targetId,
					type: 'supports',
					tempId
				}
			];

			// Add pending edge to cytoscape
			cy.add({
				group: 'edges',
				data: {
					source: `b-${sourceId}`,
					target: `b-${targetId}`,
					type: 'supports',
					tempId
				},
				classes: 'pending'
			});

			// Get the edge rendered midpoint for type picker positioning
			const edge = cy.edges().last();
			const midpoint = edge.renderedMidpoint();

			// Show type picker at edge midpoint (in rendered/screen coordinates)
			typePicker = {
				tempId,
				x: midpoint.x,
				y: midpoint.y
			};
		});

		// Handle edge selection for deletion
		cy.on('select', 'edge', (e) => {
			selectedEdge = e.target as EdgeSingular;
		});

		cy.on('unselect', 'edge', () => {
			selectedEdge = null;
		});
	});

	// Handle type selection from picker
	function selectType(type: 'supports' | 'contradicts') {
		if (!typePicker) return;

		const tempId = typePicker.tempId;

		// Update pending relation
		pendingRelations = pendingRelations.map((rel) =>
			rel.tempId === tempId ? { ...rel, type } : rel
		);

		// Update edge data
		if (cyInstance) {
			cyInstance.edges().forEach((edge) => {
				if (edge.data('tempId') === tempId) {
					edge.data('type', type);
				}
			});
		}

		// Hide picker
		typePicker = null;
	}

	// Handle keydown for deleting edges
	function handleKeydown(e: KeyboardEvent) {
		if ((e.key === 'Delete' || e.key === 'Backspace') && selectedEdge) {
			const relationId = selectedEdge.data('relationId');
			if (relationId) {
				deleteRelation(Number(relationId));
			}
		}
	}

	// Delete an existing relation
	async function deleteRelation(id: number) {
		const body = new URLSearchParams({ id: String(id) });
		await fetch('?/removeRelation', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: body.toString()
		});
		window.location.reload();
	}

	// Save all pending relations
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

	// Calculate type picker position in viewport (relative to container)
	function getPickerStyle(): string {
		if (!typePicker) return '';
		// renderedMidpoint() returns coordinates relative to the container
		return `left: ${typePicker.x}px; top: ${typePicker.y - 40}px;`;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

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
		<div class="relative">
			<div
				bind:this={container}
				class="border border-gray-200 bg-white shadow-sm"
				style="width: 100%; height: calc(100vh - 120px);"
			></div>

			{#if typePicker}
				<div
					class="absolute z-50 flex gap-1 rounded-none border border-gray-200 bg-white p-1 shadow-sm"
					style={getPickerStyle()}
				>
					<button
						onclick={() => selectType('supports')}
						class="px-2 py-1 text-xs"
						style="background-color: #f0fdf4; color: #16a34a; border: 1px solid #86efac;"
					>
						Supports
					</button>
					<button
						onclick={() => selectType('contradicts')}
						class="px-2 py-1 text-xs"
						style="background-color: #fef2f2; color: #dc2626; border: 1px solid #fca5a5;"
					>
						Contradicts
					</button>
				</div>
			{/if}
		</div>
	{/if}

	<div class="text-xs text-gray-400">
		Drag between belief nodes to create a relation. Click an edge and press Delete to remove it.
	</div>
</div>
