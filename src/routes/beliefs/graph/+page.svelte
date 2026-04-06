<script lang="ts">
	import type { PageServerData } from './$types';
	import { onMount } from 'svelte';
	import type { ElementDefinition } from 'cytoscape';

	let { data }: { data: PageServerData } = $props();

	let container: HTMLDivElement = $state(null!);

	onMount(async () => {
		const cytoscape = (await import('cytoscape')).default;

		const elements: ElementDefinition[] = [];

		// Add belief nodes
		for (const belief of data.beliefs) {
			elements.push({
				data: { id: `b-${belief.id}`, label: belief.content }
			});
		}

		// Add evidence nodes
		for (const ev of data.evidence) {
			elements.push({
				data: { id: `e-${ev.id}`, label: ev.content }
			});
		}

		// Add belief relation edges
		for (const rel of data.relations) {
			elements.push({
				data: {
					source: `b-${rel.sourceBeliefId}`,
					target: `b-${rel.targetBeliefId}`,
					label: rel.type,
					type: rel.type
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

		cytoscape({
			container,
			elements,
			style: [
				{
					selector: 'node',
					style: {
						label: 'data(label)',
						'text-wrap': 'wrap',
						'text-max-width': '200px',
						width: 'label',
						height: 'label',
						padding: '12px',
						shape: 'roundrectangle',
						'background-color': '#f9fafb',
						'border-width': 1,
						'border-color': '#d1d5db',
						'font-size': '11px',
						'text-valign': 'center',
						'text-halign': 'center'
					}
				},
				{
					selector: 'node[id ^= "e-"]',
					style: {
						'background-color': '#fefce8',
						'border-color': '#fde68a',
						'font-size': '10px'
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
			}
		});
	});
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-lg font-bold text-gray-900">Belief Graph</h1>
		<a
			href="/beliefs"
			class="border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50"
		>
			&larr; Back to list
		</a>
	</div>

	{#if data.beliefs.length === 0}
		<div class="border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
			No beliefs yet. <a href="/beliefs" class="text-gray-900 underline">Add one</a> to see the graph.
		</div>
	{:else}
		<div
			bind:this={container}
			class="border border-gray-200 bg-white shadow-sm"
			style="width: 100%; height: calc(100vh - 120px);"
		></div>
	{/if}
</div>
