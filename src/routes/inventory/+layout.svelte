<script lang="ts">
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import TabbedRoom from '$lib/components/TabbedRoom.svelte';
	import { formatMoney } from '$lib/money';
	import type { Snippet } from 'svelte';
	import type { LayoutServerData } from './$types';
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
	 */
	let { children, data }: { children: Snippet; data: LayoutServerData } = $props();

	/** Whether the shopping list is up. */
	let showRun = $state(false);
</script>

<TabbedRoom
	title={t('inventory.inventory')}
	room="inventory"
	label={t('inventory.whichList')}
	dataTour="inventory-tabs"
>
	{#snippet actions()}
		<!--
			The list you actually take to the shop.

			The room is the cupboard: what you have, where it lives, how much you
			keep. This is the one reading of it that is not about any of that —
			it is the trip — and it belongs to the room rather than to either
			tab, because it is assembled from both.
		-->
		<button class="btn btn-sm" onclick={() => (showRun = true)}>
			<Icon name="shopping" />
			{t('inventory.shoppingList2')}
			{#if data.run.lines.length > 0}
				<span class="tabular text-xs opacity-80">{data.run.lines.length}</span>
			{/if}
		</button>
	{/snippet}

	{@render children()}
</TabbedRoom>

<!--
	The trip, as a list: what has run low, how much of it, what it costs.

	A modal on a desktop and the app's own sheet on a phone, which is what
	`Modal` already is down there — this is a thing you hold up in a shop,
	so it takes the whole screen where the screen is small.
-->
<Modal bind:open={showRun} title={t('inventory.shoppingList')} size="md">
	{#if data.run.lines.length === 0}
		<EmptyState
			icon="shopping"
			title={t('inventory.nothingHasRunLow')}
			description={t('inventory.anItemJoinsThisList')}
			compact
		/>
	{:else}
		<ul class="divide-y divide-gray-200 border border-gray-200">
			{#each data.run.lines as line (line.id)}
				<li class="flex items-baseline gap-3 px-3 py-2 text-sm">
					<span class="tabular w-8 shrink-0 text-gray-500">{line.needed}×</span>
					<span class="min-w-0 flex-1">
						<span class="text-gray-900">{line.name}</span>
						{#if line.category}
							<span class="ml-2 text-xs text-gray-500">{line.category}</span>
						{/if}
					</span>
					<!-- "about", because a last known price is not a price. -->
					<span class="tabular shrink-0 text-right text-gray-600">
						{#if line.lineCents === null}
							<span class="text-xs text-gray-500">{t('inventory.noPriceYet')}</span>
						{:else}
							{formatMoney(line.lineCents, data.currency)}
						{/if}
					</span>
				</li>
			{/each}
		</ul>

		<p class="mt-3 flex items-baseline justify-between gap-3 text-sm">
			<span class="font-semibold text-gray-900">{t('inventory.about')}</span>
			<span class="tabular text-lg font-bold text-gray-900"
				>{formatMoney(data.run.totalCents, data.currency)}</span
			>
		</p>
		{#if data.run.unpriced > 0}
			<p class="text-xs text-gray-500">
				{t('inventory.noPriceYetSo', {
					unpriced: data.run.unpriced,
					have: data.run.unpriced === 1 ? t('inventory.lineHas') : t('inventory.linesHave')
				})}
			</p>
		{/if}
	{/if}

	<!--
		And the someday list, under the total rather than in it: it is what
		you would buy if the trip went well, not what you came for.
	-->
	{#if data.run.wishlist.length > 0}
		<section class="mt-6 border-t border-gray-200 pt-4">
			<h3 class="eyebrow mb-2 text-gray-500">{t('inventory.ifTheTripGoesWell')}</h3>
			<ul class="divide-y divide-gray-100">
				{#each data.run.wishlist as want (want.id)}
					<li class="flex items-baseline gap-3 py-1.5 text-sm">
						<span class="min-w-0 flex-1 text-gray-700">
							{want.name}
							{#if want.notes}
								<span class="ml-2 text-xs text-gray-500">{want.notes}</span>
							{/if}
						</span>
						{#if want.priceCents !== null}
							<span class="tabular shrink-0 text-gray-500"
								>{formatMoney(want.priceCents, data.currency)}</span
							>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</Modal>
