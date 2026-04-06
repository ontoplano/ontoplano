<script lang="ts">
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';

	let { data }: NodeProps = $props();

	let editing = $state(false);
	let editValue = $state('');

	function startEditing() {
		editValue = data.label as string;
		editing = true;
	}

	function commitEdit() {
		const trimmed = editValue.trim();
		if (trimmed && trimmed !== data.label && data.onUpdate) {
			data.onUpdate(data.beliefId as number, trimmed);
		}
		editing = false;
	}

	function cancelEdit() {
		editing = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			commitEdit();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			cancelEdit();
		}
	}
</script>

<div
	class="belief-node"
	class:positive={data.valence === 'positive'}
	class:negative={data.valence === 'negative'}
	class:neutral={data.valence !== 'positive' && data.valence !== 'negative'}
>
	<Handle type="target" position={Position.Top} />
	<div class="content">
		<span class="id-badge">{data.beliefId}</span>
		{#if editing}
			<textarea
				class="edit-textarea nodrag nowheel"
				bind:value={editValue}
				onblur={commitEdit}
				onkeydown={handleKeydown}
				rows="2"
			></textarea>
		{:else}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<span class="label" ondblclick={startEditing}>{data.label}</span>
		{/if}
	</div>
	<Handle type="source" position={Position.Bottom} />
</div>

<style>
	.belief-node {
		border: 1px solid #d1d5db;
		background: #f9fafb;
		padding: 10px 14px;
		font-size: 13px;
		line-height: 1.4;
		max-width: 260px;
		min-width: 80px;
	}

	.belief-node.positive {
		background: #f0fdf4;
		border-color: #86efac;
	}

	.belief-node.negative {
		background: #fef2f2;
		border-color: #fca5a5;
	}

	.belief-node.neutral {
		background: #f9fafb;
		border-color: #d1d5db;
	}

	.label {
		word-break: break-word;
		cursor: default;
	}

	.content {
		display: flex;
		align-items: flex-start;
		gap: 8px;
	}

	.id-badge {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border: 1px solid #d1d5db;
		background: rgba(255, 255, 255, 0.7);
		font-size: 10px;
		font-family: monospace;
		font-weight: 600;
		color: #6b7280;
	}

	.edit-textarea {
		width: 100%;
		min-width: 160px;
		border: 1px solid #9ca3af;
		padding: 4px 6px;
		font-size: 13px;
		line-height: 1.4;
		font-family: inherit;
		resize: vertical;
		background: white;
	}

	.edit-textarea:focus {
		outline: none;
		border-color: #111827;
		box-shadow: 0 0 0 1px #111827;
	}
</style>
