<script lang="ts">
	import InventoryRoom from '$lib/components/InventoryRoom.svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<!-- The wishlist: things you might get one day, which nothing is short of. -->
<InventoryRoom list="someday" {data} {form} />
