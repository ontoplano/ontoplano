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
	let hasNotes = $derived(!!data?.notes);

	let showActions = $state(false);
	let editingNotes = $state(false);
	let noteInput = $state('');

	function startEditNotes() {
		noteInput = data?.notes ?? '';
		editingNotes = true;
	}

	async function saveNotes() {
		if (data?.onUpdateNotes && data?.relationId) {
			await data.onUpdateNotes(data.relationId, noteInput);
		}
		editingNotes = false;
	}

	function cancelEditNotes() {
		editingNotes = false;
	}

	function handleNoteKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			saveNotes();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			cancelEditNotes();
		}
	}
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
		onmouseenter={() => (showActions = true)}
		onmouseleave={() => {
			showActions = false;
			if (editingNotes) cancelEditNotes();
		}}
	>
		<div class="edge-label" style="background: {labelBg}; color: {color}; border-color: {color};">
			{data?.type ?? ''}{#if hasNotes}<span class="note-indicator" title={data?.notes}>¹</span>{/if}
		</div>
		{#if showActions && !editingNotes}
			<button
				class="action-btn edit-btn"
				onclick={(e) => {
					e.stopPropagation();
					startEditNotes();
				}}
				title={hasNotes ? 'Edit note' : 'Add note'}
			>
				✎
			</button>
			<button
				class="action-btn delete-btn"
				onclick={(e) => {
					e.stopPropagation();
					if (data?.onDelete) data.onDelete(id, data?.relationId);
				}}
				title="Remove relation"
			>
				&times;
			</button>
		{/if}
		{#if editingNotes}
			<!-- svelte-ignore a11y_autofocus -->
			<input
				type="text"
				class="note-input"
				bind:value={noteInput}
				onkeydown={handleNoteKeydown}
				placeholder="note..."
				autofocus
			/>
			<button
				class="action-btn save-btn"
				onclick={(e) => {
					e.stopPropagation();
					saveNotes();
				}}
				title="Save"
			>
				✓
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
		white-space: nowrap;
	}

	.note-indicator {
		margin-left: 1px;
		font-weight: bold;
		cursor: help;
	}

	.action-btn {
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

	.edit-btn:hover {
		background: #f0f9ff;
		color: #3b82f6;
		border-color: #93c5fd;
	}

	.save-btn:hover {
		background: #f0fdf4;
		color: #22c55e;
		border-color: #86efac;
	}

	.note-input {
		font-size: 10px;
		padding: 1px 4px;
		border: 1px solid #d1d5db;
		width: 120px;
		outline: none;
	}

	.note-input:focus {
		border-color: #111827;
		box-shadow: 0 0 0 1px #111827;
	}
</style>
