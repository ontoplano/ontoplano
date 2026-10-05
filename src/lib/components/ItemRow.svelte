<script lang="ts" module>
	/**
	 * The wash on the row around an item, wherever the row is drawn.
	 *
	 * What you have is blue, so a restocked thing is seen where it is rather
	 * than by reading its count; what you put away is dimmed. Still to buy is
	 * the list's normal state and is left plain.
	 */
	export function itemRowWash(item: { bought: boolean; snoozed: boolean }): string {
		if (item.snoozed) return 'opacity-50';
		return item.bought ? 'bg-blue-50' : '';
	}
</script>

<script lang="ts">
	/**
	 * One thing you own or mean to buy, wherever it is shown.
	 *
	 * Written inside the Inventory room, so a thing filed under a subject was a
	 * name and a tick: no count to press up and down, no price, no fields of
	 * its own, no sight of which recipes use it. The count is the whole point
	 * of the list — two tins and none are both "unticked" until you look — and
	 * a row without it is a checkbox.
	 *
	 * The same move as `GoalCard`, `IdeaCard`, `BillRow`, `HabitCard`,
	 * `RecipeCard` and `WorkoutCard`. Where it posts is a prop
	 * (`$lib/item-action-names`); what it posts to is the same handler either
	 * way (`$lib/services/item-actions`).
	 */
	import Icon from '$lib/components/Icon.svelte';
	import RowCard from '$lib/components/RowCard.svelte';
	import TickBox from '$lib/components/TickBox.svelte';
	import Counter from '$lib/components/Counter.svelte';
	import { resolve } from '$app/paths';
	import { enhance } from '$lib/enhance';
	import { armed } from '$lib/actions/armed';
	import { formatMoney, type Currency } from '$lib/money';
	import type { ItemActionNames } from '$lib/item-action-names';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { useT } from '$lib/i18n';

	const t = useT();

	/** What a row needs off an item — `listItems` gives exactly this. */
	type Shown = {
		id: number;
		name: string;
		notes: string | null;
		qty: number;
		idealQty: number;
		priceCents: number | null;
		attributes?: string | null;
		type: string;
		bought: boolean;
		snoozed: boolean;
		pictureId?: number | null;
	};

	let {
		item,
		currency,
		actions,
		/** Which recipes use it, where the screen knows. */
		usedIn = [],
		/** The colour an attribute was given, where the screen has the vocabulary. */
		chipColor,
		onedit,
		/**
		 * What a tick does while the browser is offline.
		 *
		 * The shopping list is pressed in a shop with no signal, so the room
		 * hands its own submit function in. Anywhere else the ordinary one is
		 * right — a notebook is not where somebody stands in an aisle.
		 */
		onsubmit,
		/**
		 * What confirming a delete does.
		 *
		 * The Inventory room takes the row off screen and waits five seconds
		 * before it actually asks the server, so Undo costs nothing — see
		 * `deferDelete` there. Anywhere else the ordinary submit is right.
		 */
		ondeletesubmit,
		/**
		 * Whether this row is asking "really delete?", where the screen decides.
		 *
		 * Null means the row decides for itself. The Inventory room passes it,
		 * because Escape there cancels the question from anywhere on the page.
		 */
		confirming = null,
		onconfirm,
		/**
		 * Keep a picture's room on this row, picture or not — the list passes
		 * it when any row in it has one, so the names stay in one column.
		 */
		thumb = false
	}: {
		item: Shown;
		currency: Currency;
		actions: ItemActionNames;
		usedIn?: { id: number; title: string }[];
		chipColor?: (key: string, value: string) => string | undefined;
		onedit?: (id: number) => void;
		onsubmit?: SubmitFunction;
		ondeletesubmit?: (item: { id: number; name: string }) => SubmitFunction;
		confirming?: boolean | null;
		onconfirm?: (id: number | null) => void;
		thumb?: boolean;
	} = $props();

	let ownConfirming = $state(false);
	const asking = $derived(confirming ?? ownConfirming);

	function ask(on: boolean) {
		if (onconfirm) onconfirm(on ? item.id : null);
		else ownConfirming = on;
	}

	function fieldsOf(raw: string | null | undefined): [string, string][] {
		try {
			return Object.entries(JSON.parse(raw || '{}') as Record<string, string>);
		} catch {
			return [];
		}
	}

	const pairs = $derived(fieldsOf(item.attributes));
</script>

<!--
	The card a task is drawn on — `RowCard`: the count, or the tick, where a
	task has its tick; the name beside it; what it is and what uses it along
	the foot, with the verbs at the end of that line. The row around it keeps
	the padding, the cursor and the drag.
-->
{#snippet picture()}
	<!-- Empty where there is no picture: no placeholder asking for one. -->
	<span class="item-thumb block">
		{#if item.pictureId}
			<img
				src="/media/{item.pictureId}"
				alt={item.name}
				loading="lazy"
				data-view
				class="size-full cursor-zoom-in border border-gray-200 bg-gray-50 object-cover"
			/>
		{/if}
	</span>
{/snippet}

<RowCard thumb={thumb ? picture : undefined}>
	{#snippet rail()}
		{#if item.type === 'someday'}
			<!--
				A tick here and a count over there, deliberately.

				A wishlist item is a chair or a pair of headphones — you own it or you do
				not, and "how many armchairs" is not a question anybody is asking. The
				things you restock are the ones a number is about.
			-->
			<form method="POST" action={actions.toggleBought} use:enhance={onsubmit ?? (() => {})}>
				<input type="hidden" name="id" value={item.id} />
				<!-- The same box a task is ticked with — see `TickBox`. -->
				<button
					type="submit"
					aria-pressed={item.bought}
					class="-m-1 flex p-1 pointer-coarse:w-11 pointer-coarse:justify-center"
					title={item.bought ? t('inventory.putItBackOnThe') : t('tasks.plan.gotIt')}
					aria-label="{item.bought
						? t('inventory.putBackOnTheList')
						: t('tasks.plan.gotIt')}: {item.name}"
				>
					<TickBox done={item.bought} />
				</button>
			</form>
		{:else}
			<!--
				The count down the left edge, where the thumb already is and where the
				tick used to be. Stacked rather than in a line: three controls across the
				front of a row is forty pixels of width on a phone that the name then
				does not have, and a name that has run out of width breaks one letter per
				line.
			-->
			<!--
				The count answers the press at once and is sent when the pressing stops,
				and it is a field: five more is typing it, not five presses. See `Counter`.
				The count you are measured against is written beside it — one as much as
				four — so "two of four" is a glance rather than an arithmetic, and every
				row reads the same way.
			-->
			<Counter
				vertical
				value={item.qty}
				action={actions.setQty}
				name="qty"
				fields={{ id: item.id }}
				label={t('inventory.hereAndYou', {
					name: item.name,
					qty: item.qty,
					idealQty: item.idealQty
				})}
				lessLabel={t('inventory.oneFewer2', { name: item.name })}
				moreLabel={t('inventory.oneMore2', { name: item.name })}
				valueClass={(qty) =>
					qty >= Math.max(item.idealQty, 1) ? 'text-blue-700' : 'text-gray-900'}
				class="w-full shrink-0 leading-none"
			>
				{#snippet suffix()}
					{#if item.idealQty > 0}<span class="text-xs text-gray-500">/{item.idealQty}</span>{/if}
				{/snippet}
			</Counter>
		{/if}
	{/snippet}

	{#snippet labels()}
		<!--
			The line under the name, and why it has a floor and no ceiling.

			Its height is reserved — `min-h` — so a thing gaining its first field or
			its first recipe does not make the row taller and push every row under it
			down the screen. Nothing appears here on a press.
		-->
		<span class="flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1">
			{#if usedIn.length > 0}
				<span class="inline-flex flex-wrap items-center gap-1 align-middle">
					<Icon name="utensils" size={12} class="text-gray-500" />
					{#each usedIn as recipe, i (recipe.id)}
						<a
							href={resolve('/health/recipes/[id]', { id: String(recipe.id) })}
							class="-my-1 py-1 text-xs text-gray-500 hover:text-gray-900 hover:underline pointer-coarse:-my-2 pointer-coarse:py-2"
						>
							{recipe.title}{#if i < usedIn.length - 1}<span aria-hidden="true">,</span>{/if}
						</a>
					{/each}
				</span>
			{/if}

			<!--
				What this particular thing is, in its own words.

				A tape is 3m or 5m and a cable is USB-C or not; nothing else in the app
				has either attribute, so they are the thing's rather than a column. A
				name with no value is drawn as the bare word — "cable:" is a question
				the chip is not answering.
			-->
			{#if pairs.length > 0}
				<span class="flex flex-wrap items-center gap-1">
					{#each pairs as [key, value] (key)}
						{@const color = chipColor?.(key, value)}
						<!-- A soft wash of the colour it was given rather than the full
						     strength: three facts on one row read as facts, not as a
						     rainbow of alarms. The ink is computed from the wash. -->
						<span class="chip {color ? 'pill-soft' : ''}" style={color ? `--pill:${color}` : ''}
							>{value ? `${key}: ${value}` : key}</span
						>
					{/each}
				</span>
			{/if}
		</span>
	{/snippet}

	{#snippet controls()}
		<button
			onclick={() => onedit?.(item.id)}
			class="icon-btn"
			title={t('ui.edit')}
			aria-label={t('inventory.edit', { name: item.name })}><Icon name="edit" /></button
		>
		<form method="POST" action={actions.toggleSnoozed} use:enhance={onsubmit ?? (() => {})}>
			<input type="hidden" name="id" value={item.id} />
			<button
				type="submit"
				class="icon-btn"
				aria-pressed={item.snoozed}
				title={item.snoozed ? t('inventory.putItBackOnThe') : t('inventory.archive')}
				aria-label="{item.snoozed
					? t('inventory.putItBackOnThe')
					: t('inventory.archive')}: {item.name}"
			>
				<Icon name={item.snoozed ? 'undo' : 'archive'} />
			</button>
		</form>
		{#if asking}
			<form
				data-leaves
				method="POST"
				action={actions.remove}
				use:enhance={ondeletesubmit?.(item) ??
					(() =>
						async ({ update }) => {
							await update({ reset: false });
							ask(false);
						})}
			>
				<input type="hidden" name="id" value={item.id} />
				<button type="submit" class="btn btn-sm btn-danger" use:armed>
					{t('inventory.confirm')}
				</button>
			</form>
			<button type="button" onclick={() => ask(false)} class="btn btn-sm">
				{t('ui.cancel')}
			</button>
		{:else}
			<button
				type="button"
				onclick={() => ask(true)}
				class="icon-btn icon-btn-danger"
				title={t('ui.delete')}
				aria-label={t('inventory.delete', { name: item.name })}><Icon name="trash" /></button
			>
		{/if}
	{/snippet}

	<p class="leading-snug">
		<span
			class="text-sm font-medium break-words {item.type === 'someday' && item.bought
				? 'text-gray-500 line-through'
				: 'text-gray-900'}">{item.name}</span
		>
		{#if item.notes}
			<span class="ml-2 text-xs text-gray-500">{item.notes}</span>
		{/if}

		<!--
			What this usually costs, beside the thing it costs. It was summed into
			the total at the top and rendered on no row, so editing an item's price
			looked exactly like an edit that had not saved.
		-->
		{#if item.priceCents !== null}
			<span class="tabular ml-2 text-xs text-gray-500">
				{formatMoney(item.priceCents, currency)}
			</span>
		{/if}
	</p>
</RowCard>

<style>
	/* The size of the thing, beside the name; smaller on a phone, where the
	   width is the name's. */
	.item-thumb {
		width: 3.5rem;
		height: 3.5rem;
	}

	@media (width < 40rem) {
		.item-thumb {
			width: 2.75rem;
			height: 2.75rem;
		}
	}
</style>
