<script lang="ts" generics="Verb extends string">
	import type { Snippet } from 'svelte';
	import Icon, { type IconName } from '$lib/components/Icon.svelte';
	import { phoneWidth } from '$lib/breakpoints.svelte';
	import type { Selection } from '$lib/selection.svelte';
	import { useT } from '$lib/i18n';

	/**
	 * "Select many", and what can be done to what was chosen.
	 *
	 * One bar for every list that offers it — tasks and notes — so the button,
	 * the count and the verbs sit in the same places and read the same way.
	 * The state is `Selection`; the round boxes on the rows are `SelectBox`;
	 * the dialog a verb opens is `BatchDialog`.
	 */
	let {
		selection,
		visible,
		verbs,
		selectAllLabel,
		dataTour = null,
		aside,
		strip
	}: {
		selection: Selection<Verb>;
		/** The ids on screen, in order: what "select all" takes. */
		visible: number[];
		verbs: { key: Verb; label: string; icon: IconName }[];
		/** "Select all visible tasks" — the thing a list holds, named. */
		selectAllLabel: string;
		dataTour?: string | null;
		/** Drawn at the far end of the row, on a phone only — the list's order. */
		aside?: Snippet;
		/**
		 * The list's filter strip, handed the "Select many" button to place —
		 * in a `FilterBar`'s `verb` slot. With it there is no band of its own:
		 * the button costs no line, and while choosing, the tools cover the
		 * strip to the left of it, so nothing on the page moves.
		 */
		strip?: Snippet<[Snippet]>;
	} = $props();

	const t = useT();
	const phone = phoneWidth();
	const count = $derived(visible.filter((id) => selection.has(id)).length);

	/*
	 * Where the tools go: after the search box and its count, which stay
	 * usable — "select all visible" is for a list somebody has just narrowed —
	 * and before the button, which stays uncovered because it is the way out.
	 * A strip too narrow for the tools there gives them the search box's
	 * place as well.
	 */
	let holder = $state<HTMLElement>();
	let toggleButton = $state<HTMLElement>();
	let coverLeft = $state(0);
	let coverRight = $state(0);
	let coverTop = $state(0);

	$effect(() => {
		if (!strip || !selection.selecting || !holder || !toggleButton) return;
		const measure = () => {
			const box = holder!.getBoundingClientRect();
			const button = toggleButton!.getBoundingClientRect();
			coverRight = Math.max(0, box.right - button.left + COVER_GAP_PX);
			// The strip's own line, not the saved-filters line above it.
			const row = holder!.querySelector('.filter-strip')?.getBoundingClientRect();
			coverTop = row ? row.top - box.top : 0;
			const kept = [...holder!.querySelectorAll('.filter-lead, .filter-count')].map(
				(one) => one.getBoundingClientRect().right
			);
			const after = kept.length ? Math.max(...kept) - box.left + COVER_GAP_PX : 0;
			coverLeft = button.left - box.left - after >= TOOLS_MIN_PX ? after : 0;
		};
		measure();
		window.addEventListener('resize', measure);
		return () => window.removeEventListener('resize', measure);
	});

	/** The space between the tools and the button, as the strip's own gap. */
	const COVER_GAP_PX = 8;
	/** Past the strip's edges, so the fields' shadows do not show round it. */
	const COVER_BLEED_PX = 4;
	/** About what the tools take across: two icons, the count, four verbs. */
	const TOOLS_MIN_PX = 320;
</script>

{#snippet toggle()}
	<button
		bind:this={toggleButton}
		type="button"
		data-tour={dataTour}
		class="selection-toggle btn btn-sm shrink-0"
		aria-pressed={selection.selecting}
		title={t('selection.selectMany')}
		aria-label={t('selection.selectMany')}
		onclick={() => {
			if (selection.selecting) selection.end();
			else selection.start();
		}}
	>
		<Icon name="checklist" size={14} />
		<span class="hidden sm:inline">{t('selection.selectMany')}</span>
	</button>
{/snippet}

{#snippet tools()}
	<div class="flex items-center gap-1">
		<button
			type="button"
			class="icon-btn"
			title={selectAllLabel}
			aria-label={selectAllLabel}
			disabled={!visible.length}
			onclick={() => {
				for (const id of visible) selection.chosen.add(id);
			}}><Icon name="select-all" /></button
		>
		<button
			type="button"
			class="icon-btn"
			title={t('selection.clear')}
			aria-label={t('selection.clear')}
			disabled={!count}
			onclick={() => selection.chosen.clear()}><Icon name="close" /></button
		>
	</div>
	<span
		class="tabular min-w-20 text-xs text-gray-600"
		aria-live="polite"
		class:invisible={!selection.selecting}
	>
		{t('selection.count', { count })}
	</span>
	<div
		class="flex items-center gap-1 border-l border-gray-200 pl-2"
		class:invisible={!selection.selecting}
		title={t('selection.keys')}
	>
		{#each verbs as verb (verb.key)}
			<button
				type="button"
				class="icon-btn"
				title={verb.label}
				aria-label={verb.label}
				disabled={!count}
				onclick={() => selection.open(verb.key)}
			>
				<Icon name={verb.icon} />
			</button>
		{/each}
	</div>
{/snippet}

{#if strip}
	<div class="relative w-full" bind:this={holder}>
		{@render strip(toggle)}
		{#if !phone.current && selection.selecting}
			<div
				class="selection-cover absolute flex items-center gap-2 bg-white"
				style="right: {coverRight}px; top: {coverTop -
					COVER_BLEED_PX}px; bottom: -{COVER_BLEED_PX}px; left: {coverLeft -
					COVER_BLEED_PX}px; padding-left: {COVER_BLEED_PX}px"
				role="toolbar"
				aria-label={t('selection.selectMany')}
			>
				{@render tools()}
			</div>
		{/if}
	</div>
{:else}
	<div
		data-tour={dataTour}
		class="controls-sm flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-2"
	>
		<button
			type="button"
			class="btn btn-sm w-36 shrink-0"
			aria-pressed={selection.selecting}
			onclick={() => {
				if (selection.selecting) selection.end();
				else selection.start();
			}}
		>
			{selection.selecting ? t('ui.cancel') : t('selection.selectMany')}
		</button>
		{#if phone.current && aside}<div class="ml-auto">{@render aside()}</div>{/if}
		<!-- Reserved beside the button on a wide screen, so pressing it moves
		     nothing. A phone has no room beside it: the tools float over the foot
		     of the screen instead, and only while selecting. -->
		{#if !phone.current}
			<div class="contents {selection.selecting ? '' : '[&>*]:invisible'}">
				{@render tools()}
			</div>
		{/if}
	</div>
{/if}
{#if phone.current && selection.selecting}
	<div
		class="float-layer overlay-face fixed inset-x-3 z-40 flex flex-wrap items-center justify-between gap-2 border px-3 py-2 shadow-overlay"
		style="bottom: calc(var(--safe-bottom) + var(--mobile-nav-height) + 0.75rem)"
		role="toolbar"
		aria-label={t('selection.selectMany')}
	>
		{@render tools()}
	</div>
{/if}

<style>
	/* Above the cover, which stops short of it anyway: the one way out. */
	.selection-toggle {
		position: relative;
		z-index: 4;
	}

	/* Over the strip's own raised controls — a focused field lifts itself. */
	.selection-cover {
		z-index: 3;
	}
</style>
