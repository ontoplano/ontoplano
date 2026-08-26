<script lang="ts">
	import type { Snippet } from 'svelte';

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
	 * for whatever acts on the card. `AGENTS.md` already said card labels are
	 * `.eyebrow`; the other two were drift.
	 */
	let {
		title,
		description = '',
		/** The section's colour, drawn as a rule above the header. Omit for chrome. */
		accent = '',
		/** Body padding off, for a card whose content is a full-width list. */
		flush = false,
		actions,
		children
	}: {
		title: string;
		description?: string;
		accent?: string;
		flush?: boolean;
		actions?: Snippet;
		children: Snippet;
	} = $props();
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
	class="flex flex-col border border-gray-200 bg-white shadow-card {accent ? 'card-accent' : ''}"
	style={accent ? `--card-accent: ${accent}` : ''}
>
	<!-- The actions do not shrink, so on a phone a long title and a button
	     side by side left the title one word wide. Below `sm` they stack. -->
	<header
		class="section-tint flex flex-col gap-2 border-b border-gray-200 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
	>
		<div class="min-w-0">
			<h2 class="eyebrow text-gray-500">{title}</h2>
			{#if description}
				<p class="mt-1.5 text-sm text-gray-500">{description}</p>
			{/if}
		</div>
		{#if actions}
			<div class="flex flex-wrap items-center gap-2 sm:shrink-0">
				{@render actions()}
			</div>
		{/if}
	</header>

	<div class={flush ? 'flex-1' : 'flex-1 p-4'}>
		{@render children()}
	</div>
</section>
