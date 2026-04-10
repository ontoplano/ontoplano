<script lang="ts">
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';
	import { EVIDENCE_NODE } from '$lib/colors.js';

	let { data }: NodeProps = $props();

	function getIslandColorValue(): string | null {
		const getter = data.getIslandColor as (() => string | null) | undefined;
		return getter ? getter() : null;
	}

	let icolor = $derived(getIslandColorValue());
</script>

<div
	class="evidence-node"
	style="border-color: {EVIDENCE_NODE.border}; background: {EVIDENCE_NODE.bg};{icolor
		? ` border-left: 3px solid ${icolor}`
		: ''}"
>
	<Handle type="source" position={Position.Bottom} />
	<div class="label">{data.label}</div>
</div>

<style>
	.evidence-node {
		border: 1px solid;
		padding: 8px 12px;
		font-size: 11px;
		line-height: 1.4;
		max-width: 220px;
		min-width: 60px;
	}

	.label {
		word-break: break-word;
	}
</style>
