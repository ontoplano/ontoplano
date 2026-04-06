<script lang="ts">
	import { BaseEdge, EdgeLabel, getBezierPath, type EdgeProps } from '@xyflow/svelte';

	let {
		id,
		sourceX,
		sourceY,
		targetX,
		targetY,
		sourcePosition,
		targetPosition,
		data,
		markerEnd
	}: EdgeProps = $props();

	let pathResult = $derived(
		getBezierPath({
			sourceX,
			sourceY,
			targetX,
			targetY,
			sourcePosition,
			targetPosition
		})
	);

	let edgePath = $derived(pathResult[0]);
	let labelX = $derived(pathResult[1]);
	let labelY = $derived(pathResult[2]);

	let isSupports = $derived(data?.type === 'supports');
	let color = $derived(isSupports ? '#22c55e' : '#ef4444');
	let labelBg = $derived(isSupports ? '#f0fdf4' : '#fef2f2');
	let isPending = $derived(data?.pending === true);
</script>

<BaseEdge
	path={edgePath}
	{markerEnd}
	style="stroke: {color}; stroke-width: 1.5;{isPending ? ' stroke-dasharray: 5 3;' : ''}"
/>
<EdgeLabel x={labelX} y={labelY}>
	<div class="edge-label" style="background: {labelBg}; color: {color}; border-color: {color};">
		{data?.type ?? ''}
	</div>
</EdgeLabel>

<style>
	.edge-label {
		font-size: 10px;
		padding: 2px 6px;
		border: 1px solid;
		pointer-events: all;
		cursor: default;
	}
</style>
