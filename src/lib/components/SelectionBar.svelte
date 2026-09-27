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
		aside
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
	} = $props();

	const t = useT();
	const phone = phoneWidth();
	const count = $derived(visible.filter((id) => selection.has(id)).length);
</script>

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
		class="tabular min-w-24 text-xs text-gray-600"
		aria-live="polite"
		class:invisible={!selection.selecting}
	>
		{t('selection.count', { count })}
	</span>
	<div
		class="flex items-center gap-1 border-l border-gray-200 pl-2"
		class:invisible={!selection.selecting}
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
		<kbd class="text-xs" title={t('selection.keys')}></kbd>
	</div>
{/snippet}

<div
	data-tour={dataTour}
	class="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-2"
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
