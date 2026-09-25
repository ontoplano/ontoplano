<script lang="ts">
	/**
	 * The controls that narrow a list: out on a desktop, a sheet on a phone.
	 *
	 * Every room grew its own answer to the same problem and they disagreed:
	 * the task list put seven controls in a row that needed three lines on a
	 * phone, Inventory opened its four in a modal, Finance put four pickers in
	 * a toolbar. Same object, three shapes.
	 *
	 * **Where there is room, they are simply there.** Filtering is a loop —
	 * narrow, look, adjust — and a press between somebody and a control they
	 * can already see room for is a press in the middle of that loop. They sat
	 * behind a disclosure at every width for a while, which also meant opening
	 * it moved whatever the fold pushed down.
	 *
	 * **On a phone they are a sheet**, because the row genuinely is not there:
	 * four controls do not fit across 390px beside a search box and an order,
	 * and reserving the space they need costs two permanent rows of a screen
	 * that has about nine. The trade is real and it is the narrow case only.
	 *
	 * The risk of putting anything behind a press is that a filter somebody
	 * cannot see is a filter they forget is on, so the phone's button carries a
	 * dot while something is narrowing the list, says what in its accessible
	 * name, and the way back to everything stands beside it at both widths.
	 * `on` without a `summary` is a bug in the caller, not a style choice.
	 *
	 * One order, at both widths:
	 *
	 *     search   count   [ the filters ]   clear   ——   sort   direction
	 *
	 * The slack in the row goes to the filters, which is the one thing in the
	 * strip whose width nothing else is measured from — so a tab with four of
	 * them and a tab with one draw every other control in the same place, and
	 * changing tab moves nothing.
	 *
	 * What stays out at both widths is what you do not press: the search box
	 * (`lead`) is typed into, and the count and the order are read.
	 */
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { phoneWidth } from '$lib/breakpoints.svelte';
	import { useT } from '$lib/i18n';
	import { afterNavigate, goto } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import type { Snippet } from 'svelte';

	const phone = phoneWidth();

	const t = useT();

	let {
		/** Distinguishes this one's ids from another on the same page. */
		name,
		/** Whether anything is narrowing the list right now. */
		on = false,
		/**
		 * What is narrowing it, in the reader's words — "#home, #reading".
		 *
		 * The phone's button wears it, because that is the width where the
		 * controls themselves are not on the screen to say so.
		 */
		summary = '',
		onclear,
		banner,
		lead,
		count,
		trailing,
		children
	}: {
		name: string;
		on?: boolean;
		summary?: string;
		onclear?: () => void;
		/**
		 * A row of its own, above the controls.
		 *
		 * For the one thing that is not a control: the narrowings this list has
		 * kept. In the strip it was a seventh object competing with the six
		 * that answer "which rows" — so the search box, the count and the
		 * toggles were pushed onto a second and third line and the strip read
		 * as a heap. It is a different question ("one I set up earlier") and it
		 * gets its own line to ask it on.
		 */
		banner?: Snippet;
		lead?: Snippet;
		/**
		 * How many rows are showing, read rather than pressed.
		 *
		 * Beside the search box, because it is the answer to what narrowing the
		 * list just did. It rode along with the sort order before, at the far
		 * end of the strip from everything that changes it.
		 */
		count?: Snippet;
		/** The sort order and its direction, at the far end. */
		trailing?: Snippet;
		children: Snippet;
	} = $props();

	/** Whether the phone's sheet is up. Nothing on a desktop, where they are out. */
	let open = $state(false);
	let chosenLocation: URL | undefined;

	// A phone sheet owns a history entry. Popping it must not undo filters
	// applied while it was open; remember forward changes, not the pop itself.
	afterNavigate(({ type, to }) => {
		if (open && type !== 'popstate') chosenLocation = to?.url;
	});

	function closing() {
		if (navigating.type === 'goto') chosenLocation = navigating.to?.url ?? chosenLocation;
	}

	async function closed() {
		const wanted = chosenLocation;
		chosenLocation = undefined;
		// BackCloses has popped the entry; wait for the router to finish that
		// navigation before replacing its old query with the chosen one.
		await navigating.complete;
		if (!wanted || wanted.pathname !== page.url.pathname || wanted.href === page.url.href) return;
		// Same resolved route; only its filter query is being restored.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		await goto(wanted, { replaceState: true, noScroll: true, keepFocus: true, state: page.state });
	}

	/*
	 * What the button says it is doing, for whoever is not looking at it.
	 *
	 * The word "Filters" is off the button — it is an icon in a row of
	 * controls that are all icons or numbers, and the word was the widest
	 * thing in the strip on a phone, which is the only width the button exists
	 * at. It is still the accessible name, and the summary replaces it
	 * whenever something is actually narrowing the list.
	 */
	const said = $derived(on && summary ? summary : t('filters.filters'));
</script>

<!--
	The banner row, where there is a row to spare.

	On a phone it goes into the sheet with the controls, for the reason the
	controls are there: two more permanent lines above the search box, on a
	screen that has about nine, to answer a question most visits do not ask.
-->
{#if banner && !phone.current}
	<div class="mb-2 flex w-full flex-wrap items-center gap-2">{@render banner()}</div>
{/if}

<div class="flex w-full flex-wrap items-center gap-2">
	<!--
		The search box, in a slot of a fixed size.

		Its width belongs here rather than to whoever fills `lead`. It was
		`flex-1`, so it grew into whatever slack the tab's filters left — and a
		notebook's Notes tab has fewer of them than its Tasks tab, so the box
		was 405px wide on one and 235px on the other. Everything after it moved
		when you changed tab: the button, the count, all of it.

		A row of its own on a phone: it is the one control somebody types into
		rather than presses, so it takes the first line whole.
	-->
	{#if lead}
		<div class="order-first w-full min-w-32 sm:order-none sm:w-56 sm:shrink-0">
			{@render lead()}
		</div>
	{/if}

	<!-- How many rows are showing, next to the box that narrows them by name. -->
	{#if count}<div class="shrink-0">{@render count()}</div>{/if}

	{#if phone.current}
		<!--
			On a phone the filters are a sheet, because the row is not there.

			Four controls do not fit across 390px beside a search box and an
			order, and reserving the space they need costs two permanent rows of
			a screen that has about nine. The button says what is on with a dot
			so nothing is narrowed invisibly.
		-->
		<button
			type="button"
			onclick={() => {
				chosenLocation = page.url;
				open = true;
			}}
			aria-haspopup="dialog"
			aria-pressed={on}
			class="filter-toggle btn btn-sm btn-quiet shrink-0"
			title={said}
			aria-label={said}
		>
			<Icon name="filter" size={14} />
			{#if on}<span class="filter-dot" aria-hidden="true"></span>{/if}
		</button>
	{:else}
		<!--
			On anything wider they are simply there.

			They were behind a disclosure at every width, which is a press
			between somebody and the control they can already see room for — and
			opening it moved whatever the fold pushed down. Filtering is a loop:
			narrow, look, adjust. The controls stay out where the loop is short,
			and the slack in the row goes here so that nothing else in the strip
			moves when a tab has more of them than the tab beside it.
		-->
		<div id="{name}-filters" class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
			{@render children()}
		</div>
	{/if}

	<!--
		The way back to everything, beside what took it away.

		Drawn always and made invisible while there is nothing to clear, so
		switching a filter on does not move the controls beside it.
	-->
	{#if onclear}
		<button
			type="button"
			onclick={onclear}
			class="btn btn-sm btn-quiet shrink-0 {on ? '' : 'invisible'}"
			inert={!on}
		>
			{t('filters.clear')}
		</button>
	{/if}

	{#if trailing}
		<div class="ml-auto flex shrink-0 items-center gap-2">{@render trailing()}</div>
	{/if}
</div>

{#if phone.current}
	<!--
		The same controls, once, in a sheet.

		Rendered here or in the row above but never both: two copies would be
		two things with the same accessible name and a tab order that walks the
		hidden one.
	-->
	<Modal bind:open title={t('filters.filters')} size="sm" onclose={closing} onclosed={closed}>
		{#if banner}
			<div class="mb-3 flex flex-wrap items-center gap-2">{@render banner()}</div>
		{/if}
		<div id="{name}-filters" class="flex flex-wrap items-center gap-2">
			{@render children()}
		</div>

		{#snippet footer()}
			{#if onclear}
				<button
					type="button"
					class="btn"
					onclick={() => {
						onclear?.();
						open = false;
					}}
					disabled={!on}
				>
					{t('filters.clear')}
				</button>
			{/if}
			<button type="button" class="btn btn-primary" onclick={() => (open = false)}>
				{t('ui.done')}
			</button>
		{/snippet}
	</Modal>
{/if}

<style>
	/* The mark that says a filter is on while the strip is shut. */
	.filter-toggle {
		position: relative;
	}

	.filter-dot {
		position: absolute;
		top: 3px;
		right: 3px;
		width: 6px;
		height: 6px;
		border-radius: 999px;
		background-color: var(--control-on);
	}
</style>
