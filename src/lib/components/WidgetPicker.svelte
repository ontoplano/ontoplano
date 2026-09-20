<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { SECTIONS } from '$lib/colors';
	import { cardsBySection, type DashboardCard, type DashboardCardId } from '$lib/dashboard';
	import { useT } from '$lib/i18n';

	const t = useT();

	/**
	 * Everything the dashboard can show, in the rooms it comes from.
	 *
	 * What this replaces: a row of dashed "+ Bills" buttons under the cards,
	 * in registry order, with the card's own sentence hidden in a `title`
	 * attribute. Thirteen names in one line is a list you read rather than
	 * scan, it said nothing about what any of them draws, and the ones already
	 * on the dashboard were simply absent — so the row was a different length
	 * every time and there was no one place that answers "what can this page
	 * show me".
	 *
	 * So: one panel, grouped by the room each widget is about, the same rooms
	 * the wheel and the navbar use. Every widget is listed whether it is on the
	 * dashboard or not, and pressing one puts it on or takes it off — a choice
	 * you can change in place, rather than an add here and a remove over there.
	 *
	 * A dialog rather than a page of its own. `/widgets` would be a route with
	 * no way in — not a room, so not on the wheel — and choosing widgets is
	 * something you do while looking at the dashboard you are choosing them
	 * for, not somewhere else.
	 */
	let {
		open = $bindable(false),
		cards,
		layout,
		ontoggle
	}: {
		open?: boolean;
		/** The registry, minus the rooms this account has put away. */
		cards: DashboardCard[];
		/** What is on the dashboard right now, as it is being arranged. */
		layout: readonly DashboardCardId[];
		ontoggle: (id: DashboardCardId) => void;
	} = $props();

	const groups = $derived(cardsBySection(cards));
	const on = $derived(new Set<string>(layout));

	const allOn = $derived(cards.length > 0 && cards.every((card) => on.has(card.id)));
	const noneOn = $derived(cards.every((card) => !on.has(card.id)));

	/**
	 * All of them, or none.
	 *
	 * Thirteen tiles is thirteen presses to start from nothing and add back the
	 * four you want, which is the ordinary way somebody arranges this. Only the
	 * ones that would change are touched, so the layout keeps the order the
	 * rest of them were already in.
	 */
	function setAll(wanted: boolean) {
		for (const card of cards) if (on.has(card.id) !== wanted) ontoggle(card.id);
	}
</script>

<Modal
	bind:open
	title={t('home.widgets')}
	description={t('home.everythingTheDashboardCan')}
	size="lg"
>
	<div class="space-y-6">
		<!-- Both spelled out rather than one button that changes its mind: which
		     of the two it would do is the thing you need to know before pressing,
		     and a toggle only says that after you have. Each goes quiet when it
		     would do nothing. -->
		<div class="flex flex-wrap items-center justify-end gap-2 border-b border-gray-200 pb-3">
			<button type="button" class="btn btn-sm" disabled={allOn} onclick={() => setAll(true)}>
				{t('home.selectAll')}
			</button>
			<button type="button" class="btn btn-sm" disabled={noneOn} onclick={() => setAll(false)}>
				{t('home.unselectAll')}
			</button>
		</div>
		{#each groups as group (group.section)}
			<!-- A `div`, not a `section`: the playful style makes every `section` a
			     rounded surface that clips its own children, which took the first
			     letter off each of these headings and tapered the rule under it. -->
			<div>
				<!-- The room's own colour as a rule, the way a card wears it: the
				     heading is the same fact the card's accent states. -->
				<h3
					class="eyebrow border-b-2 pb-1 text-gray-600"
					style="border-color: {SECTIONS[group.section].accent}"
				>
					{t(SECTIONS[group.section].name)}
				</h3>
				<ul class="mt-3 grid gap-2 sm:grid-cols-2">
					{#each group.cards as card (card.id)}
						{@const chosen = on.has(card.id)}
						<li>
							<!--
								The whole tile is the control, and it says which state it is
								in twice: `aria-pressed` for a screen reader, and a tick
								against a marked border for an eye. Colour is never the only
								cue here either.
							-->
							<button
								type="button"
								aria-pressed={chosen}
								onclick={() => ontoggle(card.id)}
								class="widget-tile {chosen ? 'is-on' : ''}"
								style="--widget-accent: {SECTIONS[group.section].accent}"
							>
								<span class="widget-mark" aria-hidden="true">
									{#if chosen}<Icon name="check" size={14} />{/if}
								</span>
								<span class="min-w-0">
									<span class="block text-sm font-medium text-gray-900">{t(card.label)}</span>
									<span class="mt-0.5 block text-xs text-gray-500">{t(card.description)}</span>
								</span>
							</button>
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	</div>
</Modal>

<style>
	/*
	 * A widget, offered.
	 *
	 * Two lines — what it is called and what it draws — behind one target, so
	 * the tile is readable at arm's length and hittable with a thumb. The
	 * accent is the room's, shown only once chosen: thirteen coloured tiles at
	 * once is a paint chart, and the colour is meant to say "this one is on and
	 * it belongs to Finance".
	 */
	.widget-tile {
		display: flex;
		align-items: flex-start;
		gap: 0.625rem;
		width: 100%;
		padding: 0.625rem 0.75rem;
		text-align: left;
		border: 1px solid var(--color-gray-200);
		background-color: var(--color-white);
		transition:
			border-color 120ms ease,
			background-color 120ms ease;
	}

	.widget-tile:hover {
		border-color: var(--color-gray-400);
	}

	.widget-tile.is-on {
		border-color: var(--widget-accent);
		box-shadow: inset 3px 0 0 var(--widget-accent);
	}

	/* The box that says yes or no. Drawn empty rather than added when ticked,
	   so nothing in the tile moves when it is pressed. */
	.widget-mark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 1.125rem;
		height: 1.125rem;
		margin-top: 0.125rem;
		border: 1px solid var(--color-gray-300);
		color: var(--color-white);
	}

	.widget-tile.is-on .widget-mark {
		border-color: var(--widget-accent);
		background-color: var(--widget-accent);
	}
</style>
