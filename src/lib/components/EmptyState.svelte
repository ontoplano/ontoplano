<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon, { type IconName } from '$lib/components/Icon.svelte';
	import { useT } from '$lib/i18n';

	const t = useT();

	/**
	 * The only way a list says it is empty — and there are two kinds of empty.
	 *
	 * **None yet**: there is nothing at all. Say what the thing is, and put the
	 * button that makes one where the person is already looking.
	 *
	 *     <EmptyState icon="goals" title="No goals yet" description="…" />
	 *
	 * **None match**: there is plenty, and a search or a filter has hidden all
	 * of it. Saying "nothing here" then is how a list doing what it was told
	 * reads as a list that is out of date — so it says so, and offers the way
	 * back.
	 *
	 *     <EmptyState filtered onclear={clearFilters} />
	 *
	 * `compact` is for emptiness inside something else — a board column, a
	 * dialog's list, a panel: one line rather than a page's whole answer.
	 */
	let {
		icon = undefined,
		title = undefined,
		description = '',
		compact = false,
		filtered = false,
		onclear = undefined,
		action
	}: {
		/** Defaults to a magnifier when `filtered`. */
		icon?: IconName;
		/** Required for "none yet"; defaults to "Nothing matches" when `filtered`. */
		title?: string;
		description?: string;
		/**
		 * For emptiness inside something else — a panel, a dropdown, one column of
		 * a form. The full version is a page's whole answer and is far too much
		 * furniture for a list of four checkboxes that happens to have none.
		 */
		compact?: boolean;
		/** Empty because a search or a filter hid everything, not because there is nothing. */
		filtered?: boolean;
		/** With `filtered`: what the Clear button does. No button without it. */
		onclear?: () => void;
		/** The button that ends the emptiness. */
		action?: Snippet;
	} = $props();

	const glyph = $derived<IconName>(icon ?? (filtered ? 'search' : 'check'));
	const words = $derived(title ?? (filtered ? t('emptyState.noneMatch') : ''));
</script>

{#snippet clear()}
	{#if filtered && onclear}
		<button type="button" class="btn btn-sm" onclick={onclear}>{t('filters.clear')}</button>
	{/if}
{/snippet}

{#if compact}
	<div
		class="empty-state empty-state-compact flex flex-wrap items-center gap-2 px-1 py-3 text-sm text-gray-500"
	>
		<Icon name={glyph} size={14} />
		<span>{words}</span>
		{#if description}<span class="w-full">{description}</span>{/if}
		{@render clear()}
		{@render action?.()}
	</div>
{:else}
	<div class="empty-state flex flex-col items-center gap-3 px-6 py-12 text-center">
		<span class="text-gray-500">
			<Icon name={glyph} size={32} />
		</span>
		<div>
			<p class="text-sm font-medium text-gray-900">{words}</p>
			{#if description}
				<p class="mx-auto mt-1 max-w-sm text-sm text-gray-500">{description}</p>
			{/if}
		</div>
		{#if (filtered && onclear) || action}
			<div class="mt-1 flex flex-wrap justify-center gap-2">
				{@render clear()}
				{@render action?.()}
			</div>
		{/if}
	</div>
{/if}

<style>
	/* On a room's surface, a one-line empty starts where the rows' words do;
	   in a lane or a dialog it keeps to the padding of what holds it. */
	:global(.room-surface) .empty-state-compact:not(:global(.lane) *) {
		padding-inline: var(--row-pad-x);
	}
</style>
