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
	import { resolve } from '$app/paths';
	import { enhance } from '$lib/enhance';
	import { armed } from '$lib/actions/armed';
	import { formatMoney, type Currency } from '$lib/money';
	import { pillStyle } from '$lib/pill-ink';
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
		onconfirm
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
	} = $props();

	let ownConfirming = $state(false);
	const asking = $derived(confirming ?? ownConfirming);

	function ask(on: boolean) {
		if (onconfirm) onconfirm(on ? item.id : null);
		else ownConfirming = on;
	}

	const requantify =
		() =>
		async ({ update }: { update: (o?: object) => Promise<void> }) =>
			await update({ reset: false });

	function fieldsOf(raw: string | null | undefined): [string, string][] {
		try {
			return Object.entries(JSON.parse(raw || '{}') as Record<string, string>);
		} catch {
			return [];
		}
	}

	const pairs = $derived(fieldsOf(item.attributes));
</script>

{#if item.type === 'someday'}
	<!--
		A tick here and a count over there, deliberately.

		A wishlist item is a chair or a pair of headphones — you own it or you do
		not, and "how many armchairs" is not a question anybody is asking. The
		things you restock are the ones a number is about.
	-->
	<form method="POST" action={actions.toggleBought} use:enhance={onsubmit ?? (() => {})}>
		<input type="hidden" name="id" value={item.id} />
		<button
			type="submit"
			aria-pressed={item.bought}
			class="flex size-5 items-center justify-center border transition {item.bought
				? 'border-blue-600 bg-blue-600 text-white'
				: 'border-gray-400 bg-white text-transparent hover:border-gray-600'}"
			title={item.bought ? t('inventory.putItBackOnThe') : t('tasks.plan.gotIt')}
			aria-label="{item.bought
				? t('inventory.putBackOnTheList')
				: t('tasks.plan.gotIt')}: {item.name}"
		>
			<Icon name="check" size={14} />
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
	<div class="flex w-9 shrink-0 flex-col items-center leading-none">
		<form method="POST" action={actions.setQty} use:enhance={requantify} class="contents">
			<input type="hidden" name="id" value={item.id} />
			<input type="hidden" name="qty" value={item.qty + 1} />
			<button
				type="submit"
				class="icon-btn h-5 w-9 text-base"
				title={t('inventory.oneMore')}
				aria-label={t('inventory.oneMore2', { name: item.name })}>+</button
			>
		</form>
		<!--
		"2" alone does not answer the question the list is for. Where you keep
		more than one, the count you are measured against is written beside it,
		so "two of four" is a glance rather than an arithmetic.
	-->
		<span
			class="tabular py-0.5 text-center text-sm whitespace-nowrap {item.qty >=
			Math.max(item.idealQty, 1)
				? 'text-blue-700'
				: 'text-gray-900'}"
			title={t('inventory.hereAndYou', { name: item.name, qty: item.qty, idealQty: item.idealQty })}
		>
			{item.qty}{#if item.idealQty > 1}<span class="text-xs text-gray-500">/{item.idealQty}</span
				>{/if}
		</span>
		<form method="POST" action={actions.setQty} use:enhance={requantify} class="contents">
			<input type="hidden" name="id" value={item.id} />
			<input type="hidden" name="qty" value={Math.max(0, item.qty - 1)} />
			<button
				type="submit"
				disabled={item.qty <= 0}
				class="icon-btn h-5 w-9 text-base disabled:opacity-25"
				title={t('inventory.oneFewer')}
				aria-label={t('inventory.oneFewer2', { name: item.name })}>−</button
			>
		</form>
	</div>
{/if}

<div class="min-w-0 flex-1">
	<span
		class="text-sm break-words {item.type === 'someday' && item.bought
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

	<!--
		The line under the name, and why it has a floor and no ceiling.

		Its height is reserved — `min-h` — so a thing gaining its first field or
		its first recipe does not make the row taller and push every row under it
		down the screen. Nothing appears here on a press.
	-->
	<span class="mt-0.5 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1">
		{#if usedIn.length > 0}
			<span class="ml-2 inline-flex flex-wrap items-center gap-1 align-middle">
				<Icon name="utensils" size={12} class="text-gray-500" />
				{#each usedIn as recipe, i (recipe.id)}
					<a
						href={resolve('/health/recipes/[id]', { id: String(recipe.id) })}
						class="text-xs text-gray-500 hover:text-gray-900 hover:underline"
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
			<span class="mt-0.5 flex flex-wrap items-center gap-1">
				{#each pairs as [key, value] (key)}
					{@const color = chipColor?.(key, value)}
					<!-- `.pill` when there is a colour: it computes its own ink, so a
					     pale tag is readable instead of white on white. -->
					<span class={color ? 'pill' : 'chip'} style={pillStyle(color) ?? ''}
						>{value ? `${key}: ${value}` : key}</span
					>
				{/each}
			</span>
		{/if}
	</span>
</div>

<!-- Everything else at the right edge, same order, same x, every row. -->
<div class="row-actions">
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
	<button
		onclick={() => onedit?.(item.id)}
		class="icon-btn"
		title={t('ui.edit')}
		aria-label={t('inventory.edit', { name: item.name })}><Icon name="edit" /></button
	>
	{#if asking}
		<form
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
</div>
