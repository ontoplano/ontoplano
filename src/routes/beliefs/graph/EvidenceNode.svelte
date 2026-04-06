<script lang="ts">
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';

	let { data }: NodeProps = $props();
</script>

<div class="evidence-node">
	<Handle type="source" position={Position.Bottom} />
	<div class="label">{data.label}</div>
</div>

<style>
	.evidence-node {
		border: 1px solid #fde68a;
		background: #fefce8;
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
