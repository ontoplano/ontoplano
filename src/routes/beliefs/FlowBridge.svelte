<script lang="ts">
	import { useSvelteFlow } from '@xyflow/svelte';

	let { onready }: { onready: (api: ReturnType<typeof useSvelteFlow>) => void } = $props();

	const api = useSvelteFlow();
	onready(api);
</script>
