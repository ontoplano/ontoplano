<script lang="ts">
	import type { Snippet } from 'svelte';
	import FoldedText from '$lib/components/FoldedText.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { useT } from '$lib/i18n';

	/**
	 * A card, everywhere.
	 *
	 * There used to be three of these: the dashboard's accent band with a small-caps
	 * label, settings' sentence-case heading with a paragraph, and the integrations
	 * page's bordered header row. Same object, three treatments, and the app read as
	 * three apps.
	 *
	 * This is the one: a bordered surface, a header rule in the section's colour, a
	 * label in small capitals, an optional sentence under it, and room on the right
	 * for whatever acts on the card. the convention already said card labels are
	 * `.eyebrow`; the other two were drift.
	 */
	let {
		/**
		 * The label above the card. Optional: a card whose title would repeat
		 * the room's own name — "Notebooks" inside Notebooks, "Everyone" over
		 * the only group People has — says nothing, so it says nothing.
		 */
		title = '',
		description = '',
		/**
		 * Fold a long description to two lines behind a Show more, the way a
		 * notebook's own page does. For a description somebody wrote, which can
		 * run to paragraphs; the app's own one-sentence descriptions do not need it.
		 */
		foldDescription = false,
		/**
		 * A name for the section, so a link or a notification can point at it
		 * and land on it rather than at the top of the page.
		 */
		id = '',
		/** The section's colour, drawn as a rule above the header. Omit for chrome. */
		accent = '',
		/** Body padding off, for a card whose content is a full-width list. */
		flush = false,
		/**
		 * One pane of a surface that already has the edge.
		 *
		 * The card keeps its header, its accent and its body; it gives up its
		 * own border, shadow and corners, because the thing it is a part of
		 * draws them. For the halves of a split that reads as one object — see
		 * `SplitColumns` without `spaced`.
		 */
		pane = false,
		/** Placement from outside — a grid cell's span, say. Not for restyling. */
		class: className = '',
		/** The anchor a tutorial step points at. */
		dataTour = '',
		/**
		 * Folds down to its header with the chevron in the corner, for a page of
		 * many cards where somebody reads two and wants the rest out of the way.
		 * Remembered per card, by `id`, in this browser.
		 */
		collapsible = false,
		lead,
		titleActions,
		actions,
		children
	}: {
		title?: string;
		description?: string;
		foldDescription?: boolean;
		accent?: string;
		flush?: boolean;
		pane?: boolean;
		class?: string;
		dataTour?: string;
		id?: string;
		collapsible?: boolean;
		/** Drawn before the title: the picture of whatever this card is about. */
		lead?: Snippet;
		/**
		 * Drawn on the title's own line, after it: the ways into and around the
		 * thing the title names, as against `actions`, which put something in it.
		 */
		titleActions?: Snippet;
		actions?: Snippet;
		/** Optional: a card can be its title alone — the family seat's is. */
		children?: Snippet;
	} = $props();

	/*
	 * A named card keeps a little air above it when something scrolls to it —
	 * `scroll-margin-top`, so it does not sit flush under the header.
	 */

	const t = useT();

	/** Where a folded card is remembered; per browser, a convenience only. */
	const FOLDED_KEY = 'ontoplano:card-folded:';

	function readFolded(): boolean {
		if (!collapsible || !id || typeof localStorage === 'undefined') return false;
		try {
			return localStorage.getItem(FOLDED_KEY + id) === '1';
		} catch {
			return false;
		}
	}

	let folded = $state(false);
	// After mount: the server cannot read this browser's memory, and a page
	// drawn folded there and open here would disagree on hydration.
	$effect(() => {
		folded = readFolded();
	});

	function toggle() {
		folded = !folded;
		if (!id) return;
		try {
			if (folded) localStorage.setItem(FOLDED_KEY + id, '1');
			else localStorage.removeItem(FOLDED_KEY + id);
		} catch {
			// Not remembered; the card still folds.
		}
	}
</script>

<!--
	The accent is a custom property rather than a border written here, because
	where it is drawn is the style's business: a rule across the top of a square
	card, a stripe down the side of a rounded one. See `.card-accent`.
-->
<!--
	A column, so a card can pin something to its own bottom edge rather than to
	the end of its content. A card in a grid row is already as tall as the
	tallest card beside it; without this its body stopped where the content did
	and the space below belonged to nothing.
-->
<section
	id={id || undefined}
	data-tour={dataTour || undefined}
	class="flex flex-col {pane ? 'card-pane' : 'border border-gray-200 shadow-card'} bg-white {accent
		? 'card-accent'
		: ''} {className}"
	style="{accent ? `--card-accent: ${accent};` : ''}{id ? ' scroll-margin-top: 1rem;' : ''}"
>
	<!--
		The actions wrap under the title when they do not fit, and only then.

		They used to stack below `sm` unconditionally, which cost a row on every
		dashboard card to put "Open →" under a one-word heading. `flex-wrap` with
		a growing title does the same job when it is needed and nothing when it
		is not.
	-->
	<header
		class="section-tint card-header flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-gray-200"
		hidden={!title && !description && !actions && !lead && !collapsible}
	>
		{#if lead}
			<!-- Whatever the card is *of*, beside what it is called — a notebook's
			     picture, the way a person's face sits beside their name. -->
			<div class="shrink-0">{@render lead()}</div>
		{/if}
		<!--
			A basis, not just a grow: with `flex-1` alone the title's hypothetical
			width is nothing, so the row never wraps and the actions squeeze it to
			a column one syllable wide. At 12rem the actions drop under it first.
		-->
		<div class="min-w-0 flex-[1_1_12rem]">
			<!-- As tall as a line of small text, so a card whose header carries a
			     count or a note is the same height as the card beside it that
			     carries nothing: two headers in a row meet in one line. -->
			{#if title && titleActions}
				<!-- On a phone the title takes the line and these sit in its far
				     corner; wider, they follow the title. -->
				<div class="flex items-start gap-x-3 gap-y-1 sm:flex-wrap sm:items-center">
					<h2
						class="eyebrow flex min-h-4 min-w-0 flex-1 items-center text-gray-600 sm:flex-none sm:shrink-0"
					>
						{title}
					</h2>
					<div class="flex shrink-0 items-center gap-2">{@render titleActions()}</div>
				</div>
			{:else if title}<h2 class="eyebrow flex min-h-4 items-center text-gray-600">{title}</h2>{/if}
			{#if description}
				<!--
					pre-line: a description may break itself onto a second line with \n.

					`max-w-2xl` because a card is as wide as the screen and a sentence
					should not be: on a large monitor these ran past a hundred and fifty
					characters, which is a line an eye loses its place tracking back
					from. The cap is on the paragraph, not the card — the layout still
					uses the width, only the sentence stops.
				-->
				{#if foldDescription}
					<FoldedText text={description} class="mt-1.5" />
				{:else}
					<p class="mt-1.5 max-w-2xl text-sm whitespace-pre-line text-gray-500">{description}</p>
				{/if}
			{/if}
		</div>
		{#if actions || collapsible}
			<!-- Named, because the dashboard takes this corner over while cards are
			     being rearranged: the handle goes where "Open →" was rather than in
			     a bar of its own. -->
			<div class="card-actions ml-auto flex flex-wrap items-center gap-2">
				{@render actions?.()}
				{#if collapsible}
					<button
						type="button"
						class="icon-btn"
						aria-expanded={!folded}
						title={folded ? t('ui.show') : t('ui.hide')}
						aria-label={folded ? t('ui.show') : t('ui.hide')}
						onclick={toggle}
					>
						<Icon name={folded ? 'chevron-down' : 'chevron-up'} />
					</button>
				{/if}
			</div>
		{/if}
	</header>

	<div class={flush ? 'flex-1' : 'flex-1 p-4'} hidden={folded}>
		{@render children?.()}
	</div>
</section>
