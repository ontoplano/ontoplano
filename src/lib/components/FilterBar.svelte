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
	 *     search   count   [ the filters ]   clear   ——   verb   sort
	 *
	 * On one line at both widths: a phone folds the filters into a button and
	 * the order into a square (`SortControl` reads that from the strip), and
	 * nothing drops to a line of its own. The slack goes after Clear, so the
	 * way back sits against the last filter rather than across the row from it.
	 *
	 * A filter that should stay out on a phone — the only one a list has, say
	 * — goes in `inline` rather than in the children: a sheet holding one
	 * control is a press in front of a control there was room for.
	 *
	 * What stays out at both widths is what you do not press: the search box
	 * (`lead`) is typed into, and the count and the order are read.
	 */
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { phoneWidth } from '$lib/breakpoints.svelte';
	import { useT } from '$lib/i18n';
	import { setFilterStrip } from '$lib/filter-strip';
	import { afterNavigate, goto } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import type { Snippet } from 'svelte';

	const phone = phoneWidth();

	/**
	 * How wide the strip has to be for the filters to sit out in it.
	 *
	 * Measured on the strip rather than the window: a notebook's panel is a
	 * narrow list on a wide screen, and at about 750px its filters wrapped into
	 * a clogged second line beside the search box while the window said
	 * "desktop". 56rem at the default type size.
	 */
	const INLINE_MIN_PX = 896;

	let width = $state(0);
	/** Folded into the sheet: the strip is too narrow, or not measured yet on a phone. */
	const folded = $derived(width > 0 ? width < INLINE_MIN_PX : phone.current);

	setFilterStrip({
		get folded() {
			return folded;
		}
	});

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
		verb,
		trailing,
		inline,
		inlineBelow = false,
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
		/**
		 * One secondary verb about the whole list — Areas, Categories.
		 *
		 * On the first line at every width, just before the order. Rooms used
		 * to find their own place for it — an icon beside the search box on one
		 * screen, inside the Filters sheet on the next, where pressing it opened
		 * a dialog over a dialog. `StripVerb` draws it.
		 */
		verb?: Snippet;
		/**
		 * The order: a `SortControl`, at the far end of the first line at every
		 * width. It goes compact by itself while the strip is folded.
		 */
		trailing?: Snippet;
		/**
		 * Filters that stay out on the strip at every width, before the rest.
		 *
		 * For a list with one or two of them, where the phone's sheet would
		 * hide a single control behind a press. Whatever is in `children` still
		 * folds; a list whose filters are all here gets no Filters button.
		 */
		inline?: Snippet;
		/**
		 * While the strip is folded, the `inline` filters take a line of their
		 * own under the first, rather than squeezing the search box — for two
		 * of them, which do not fit beside it on a phone.
		 */
		inlineBelow?: boolean;
		/**
		 * The filters. A list with none — a search box and a count, nothing
		 * else — leaves this out, and a phone gets no Filters button to open an
		 * empty sheet with.
		 */
		children?: Snippet;
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
		// navigation before replacing its old query with the chosen one. A
		// filter picked just before Done is still loading when the pop lands,
		// and the pop aborts it: `complete` rejects, and the chosen query is
		// put back below all the same.
		await navigating.complete?.catch(() => undefined);
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
{#if banner && !folded}
	<div class="mb-2 flex w-full flex-wrap items-center gap-2">{@render banner()}</div>
{/if}

<div class="filter-strip flex w-full flex-wrap items-center gap-2" bind:clientWidth={width}>
	<!--
		The search box, in a slot of a fixed size.

		Its width belongs here rather than to whoever fills `lead`. It was
		`flex-1`, so it grew into whatever slack the tab's filters left — and a
		notebook's Notes tab has fewer of them than its Tasks tab, so the box
		was 405px wide on one and 235px on the other. Everything after it moved
		when you changed tab: the button, the count, all of it.

		On a phone it takes what the row has left, so everything shares the
		first line.
	-->
	{#if lead}
		<div class="filter-lead min-w-24 flex-1 sm:w-56 sm:flex-none sm:shrink-0">
			{@render lead()}
		</div>
	{/if}

	<!-- How many rows are showing, next to the box that narrows them by name,
	     at both widths. -->
	{#if count}<div class="filter-count shrink-0">{@render count()}</div>{/if}

	{#if inline}
		<div class="flex min-w-0 items-center gap-2" class:filter-inline-below={folded && inlineBelow}>
			{@render inline()}
		</div>
	{/if}

	{#if children && folded}
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
			class="filter-toggle btn btn-sm shrink-0"
			title={said}
			aria-label={said}
		>
			<!-- The word, not a funnel: it is the one way to the filters at this
			     width, and a glyph alone was a thing to squint at. -->
			{t('filters.filters')}
			{#if on}<span class="filter-dot" aria-hidden="true"></span>{/if}
		</button>
	{:else if children}
		<!--
			On anything wider they are simply there.

			They were behind a disclosure at every width, which is a press
			between somebody and the control they can already see room for — and
			opening it moved whatever the fold pushed down. Filtering is a loop:
			narrow, look, adjust. The controls stay out where the loop is short.
			Their own width and no more, so Clear stands against the last one.
		-->
		<div id="{name}-filters" class="flex min-w-0 flex-wrap items-center gap-2">
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
			title={t('filters.clear')}
			aria-label={t('filters.clear')}
		>
			{#if folded}<Icon name="broom" size={14} />{:else}{t('filters.clear')}{/if}
		</button>
	{/if}

	<!-- The verb and the order, pushed to the end of the first line at every
	     width. The slack in the row is the space before them. -->
	{#if verb || trailing}
		<div class="ml-auto flex shrink-0 items-center gap-2">
			{#if verb}{@render verb()}{/if}
			{#if trailing}{@render trailing()}{/if}
		</div>
	{/if}
</div>

{#if folded && children}
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
			{@render children?.()}
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
	/* Its own line, last, the controls sharing it as they would a row. */
	.filter-inline-below {
		order: 1;
		width: 100%;
	}

	.filter-inline-below > :global(*) {
		flex: 1 1 0;
		min-width: 0;
	}

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
