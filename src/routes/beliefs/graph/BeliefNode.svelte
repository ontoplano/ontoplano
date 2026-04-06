<script lang="ts">
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';

	let { data }: NodeProps = $props();
</script>

<div
	class="belief-node"
	class:positive={data.valence === 'positive'}
	class:negative={data.valence === 'negative'}
	class:neutral={data.valence !== 'positive' && data.valence !== 'negative'}
>
	<Handle type="target" position={Position.Top} />
	<div class="label">{data.label}</div>
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
	}
</style>
