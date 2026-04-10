<script lang="ts">
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';
	import { VALENCE_POSITIVE, VALENCE_NEGATIVE, VALENCE_NEUTRAL } from '$lib/colors.js';

	let { data }: NodeProps = $props();

	let editValue = $state('');

	const valenceStyles: Record<string, { bg: string; border: string }> = {
		positive: { bg: VALENCE_POSITIVE.bg, border: VALENCE_POSITIVE.border },
		negative: { bg: VALENCE_NEGATIVE.bg, border: VALENCE_NEGATIVE.border },
		neutral: { bg: VALENCE_NEUTRAL.bg, border: VALENCE_NEUTRAL.border }
	};

	let vstyle = $derived(
		valenceStyles[(data.valence as string) ?? 'neutral'] ?? valenceStyles.neutral
	);

	function isEditing(): boolean {
		const getter = data.editingNodeId as (() => number | null) | undefined;
		return getter ? getter() === (data.beliefId as number) : false;
	}

	function startEditing() {
		editValue = data.label as string;
		if (data.onStartEdit) {
			(data.onStartEdit as (id: number) => void)(data.beliefId as number);
		}
	}

	function commitEdit() {
		const trimmed = editValue.trim();
		if (trimmed && trimmed !== data.label && data.onUpdate) {
			(data.onUpdate as (id: number, content: string) => void)(data.beliefId as number, trimmed);
		}
		if (data.onCancelEdit) {
			(data.onCancelEdit as () => void)();
		}
	}

	function cancelEdit() {
		if (data.onCancelEdit) {
			(data.onCancelEdit as () => void)();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			commitEdit();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			cancelEdit();
		}
	}

	function getIslandColorValue(): string | null {
		const getter = data.getIslandColor as (() => string | null) | undefined;
		return getter ? getter() : null;
	}

	let icolor = $derived(getIslandColorValue());
</script>

<div
	class="belief-node"
	style="background: {vstyle.bg}; border-color: {vstyle.border};{icolor
		? ` border-left: 3px solid ${icolor}`
		: ''}"
>
	<Handle type="target" position={Position.Top} />
	<div class="content">
		<span class="id-badge">{data.beliefId}</span>
		<div class="main">
			{#if isEditing()}
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
			{#if data.tags && data.tags.length > 0}
				<div class="tags">
					{#each data.tags as tag (tag.tagId)}
						<span class="tag">#{tag.tagName}</span>
					{/each}
				</div>
			{/if}
		</div>
	</div>
	<Handle type="source" position={Position.Bottom} />
</div>

<style>
	.belief-node {
		border: 1px solid;
		padding: 10px 14px;
		font-size: 13px;
		line-height: 1.4;
		max-width: 260px;
		min-width: 80px;
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

	.main {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.tag {
		font-size: 10px;
		color: #9ca3af;
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
