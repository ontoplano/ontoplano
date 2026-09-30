<script lang="ts">
	import TabbedRoom from '$lib/components/TabbedRoom.svelte';
	import type { Snippet } from 'svelte';
	import { useT } from '$lib/i18n';

	const t = useT();

	/**
	 * The cupboard and the wishlist, as two tabs of one room.
	 *
	 * They were one list with a segment over it — All, Restock, Wishlist,
	 * Short — which read as four equal readings of one thing. They are not:
	 * what you keep and how much of it is one question, what you might get one
	 * day is another, and "short" is a question asked of the first. So the two
	 * lists are tabs, each with an address, and short stays a filter beside the
	 * others.
	 *
	 * The room's other screens — the shopping list, its categories and
	 * attributes — are verbs of the list's own strip (`InventoryRoom`), where
	 * every other room keeps its secondary verbs.
	 */
	let { children }: { children: Snippet } = $props();
</script>

<TabbedRoom
	title={t('inventory.inventory')}
	room="inventory"
	label={t('inventory.whichList')}
	dataTour="inventory-tabs"
>
	{@render children()}
</TabbedRoom>
