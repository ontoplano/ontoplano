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
	let color = $derived(isSupports ? '#3b82f6' : '#ef4444');
	let labelBg = $derived(isSupports ? '#eff6ff' : '#fef2f2');
	let isPending = $derived(data?.pending === true);

	let showDelete = $state(false);
</script>

<BaseEdge
	path={edgePath}
	{markerEnd}
	style="stroke: {color}; stroke-width: 1.5;{isPending ? ' stroke-dasharray: 5 3;' : ''}"
/>
<EdgeLabel x={labelX} y={labelY}>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="edge-label-wrapper"
		onmouseenter={() => (showDelete = true)}
		onmouseleave={() => (showDelete = false)}
	>
		<div class="edge-label" style="background: {labelBg}; color: {color}; border-color: {color};">
			{data?.type ?? ''}
		</div>
		{#if showDelete}
			<button
				class="delete-btn"
				onclick={(e) => {
					e.stopPropagation();
					if (data?.onDelete) data.onDelete(id, data?.relationId);
				}}
				title="Remove relation"
			>
				&times;
			</button>
		{/if}
	</div>
</EdgeLabel>

<style>
	.edge-label-wrapper {
		display: flex;
		align-items: center;
		gap: 2px;
		pointer-events: all;
	}

	.edge-label {
		font-size: 10px;
		padding: 2px 6px;
		border: 1px solid;
		cursor: default;
	}

	.delete-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		font-size: 12px;
		line-height: 1;
		border: 1px solid #d1d5db;
		background: white;
		color: #9ca3af;
		cursor: pointer;
	}

	.delete-btn:hover {
		background: #fef2f2;
		color: #ef4444;
		border-color: #fca5a5;
	}
</style>
