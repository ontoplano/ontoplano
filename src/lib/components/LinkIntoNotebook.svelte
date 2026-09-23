<script lang="ts">
	/**
	 * Putting something that already exists under this subject.
	 *
	 * Every tab could make a new thing and none of them could take one that was
	 * already there — so a renovation started halfway through meant deleting
	 * the tiles off the shopping list and writing them again. Linking is the
	 * same act whatever the thing is, which is why this is one dialog for all
	 * of them rather than nine.
	 *
	 * The search runs here rather than on the server: what a personal account
	 * holds fits in the page, and a box that filters as you type beats a round
	 * trip per keystroke. When there is more than the picker carries it says
	 * so, instead of quietly showing a slice.
	 */
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { enhance } from '$lib/enhance';
	import { fuzzyRank } from '$lib/fuzzy';
	import { useT } from '$lib/i18n';

	const t = useT();

	let {
		open = $bindable(false),
		/** Which module is being linked — the action reads it back. */
		module,
		/** The button's own words, which are the dialog's title. */
		what,
		notebookId,
		candidates = { items: [], more: false },
		action
	}: {
		open?: boolean;
		module: string;
		what: string;
		notebookId: number;
		candidates?: { items: { id: number; label: string; elsewhere: boolean }[]; more: boolean };
		action: string;
	} = $props();

	let query = $state('');

	// Best first, and an empty query leaves the order alone — the point of the
	// picker is that it shows what there is before anybody types.
	const shown = $derived(fuzzyRank(candidates.items, query, (one) => one.label).map((r) => r.item));

	function close() {
		open = false;
		query = '';
	}
</script>

<Modal {open} onclose={close} title={what} size="sm">
	<div class="space-y-3">
		<OneLine
			name="q"
			bind:value={query}
			placeholder={t('notebooks.searchToLink')}
			class="input w-full"
			autofocus
		/>

		{#if candidates.items.length === 0}
			<EmptyState icon="link" title={t('notebooks.nothingLeftToLink')} compact />
		{:else if shown.length === 0}
			<p class="px-1 py-3 text-sm text-gray-500">{t('notebooks.nothingMatchesThat')}</p>
		{:else}
			<ul class="max-h-80 divide-y divide-gray-100 overflow-y-auto">
				{#each shown as one (one.id)}
					<li>
						<form
							method="post"
							{action}
							use:enhance={() =>
								async ({ update, result }) => {
									await update({ reset: false });
									if (result.type === 'success') close();
								}}
						>
							<input type="hidden" name="module" value={module} />
							<input type="hidden" name="id" value={one.id} />
							<input type="hidden" name="notebookId" value={notebookId} />
							<button
								class="flex w-full items-center gap-2 px-1 py-2 text-left text-sm hover:bg-gray-50"
							>
								<Icon name="link" size={14} class="shrink-0 text-gray-500" />
								<span class="min-w-0 flex-1 truncate text-gray-900">{one.label}</span>
								<!--
									Said out loud, because moving one is not the same as filing
									one: it comes off the subject it is under now.
								-->
								{#if one.elsewhere}
									<span class="eyebrow shrink-0 text-gray-500"
										>{t('notebooks.inAnotherNotebook')}</span
									>
								{/if}
							</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}

		{#if candidates.more}
			<p class="text-xs text-gray-500">{t('notebooks.onlyTheFirstAreListed')}</p>
		{/if}
	</div>

	{#snippet footer()}
		<button type="button" class="btn" onclick={close}>{t('ui.cancel')}</button>
	{/snippet}
</Modal>
