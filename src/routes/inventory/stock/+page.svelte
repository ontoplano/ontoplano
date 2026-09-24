<script lang="ts">
	import InventoryRoom from '$lib/components/InventoryRoom.svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<!-- The cupboard: what you keep, how much of it, and where it lives. -->
<InventoryRoom list="replenish" {data} {form} />
