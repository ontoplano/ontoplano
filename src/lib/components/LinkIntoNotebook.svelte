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
	 *
	 * ## Several at once, and what that costs
	 *
	 * Every row was its own form and one press filed one thing and closed the
	 * dialog — so bringing the six things already on the shopping list into a
	 * renovation was six openings. They tick instead, and one button at the
	 * foot says how many.
	 *
	 * Which makes the warning necessary. Filing something that is under
	 * another subject *moves* it: a notebook holds a row rather than a copy of
	 * one, so it stops being where it was. One at a time that was a line on
	 * the row; six at a time it has to be said before the press, with the list
	 * of which ones, because nobody reads six rows again on the way past.
	 */
	import Modal from '$lib/components/Modal.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { enhance } from '$lib/enhance';
	import { fuzzyRank } from '$lib/fuzzy';
	import { useT } from '$lib/i18n';
	import { say } from '$lib/said.svelte';

	const t = useT();

	let {
		open = $bindable(false),
		/** Which module is being linked — the action reads it back. */
		module,
		/** The button's own words, which are the dialog's title. */
		what,
		notebookId,
		/** What to call it in the toast afterwards. */
		notebookTitle,
		candidates = { items: [], more: false },
		action
	}: {
		open?: boolean;
		module: string;
		what: string;
		notebookId: number;
		notebookTitle: string;
		candidates?: { items: { id: number; label: string; elsewhere: boolean }[]; more: boolean };
		action: string;
	} = $props();

	let query = $state('');
	let chosen = $state<number[]>([]);
	/** Out while the ones that would move are being read. */
	let confirming = $state(false);

	// Best first, and an empty query leaves the order alone — the point of the
	// picker is that it shows what there is before anybody types.
	const shown = $derived(fuzzyRank(candidates.items, query, (one) => one.label).map((r) => r.item));

	const picked = $derived(candidates.items.filter((one) => chosen.includes(one.id)));
	/** The ones that are under another subject now, which this takes them off. */
	const moving = $derived(picked.filter((one) => one.elsewhere));

	const toggle = (id: number) =>
		(chosen = chosen.includes(id) ? chosen.filter((one) => one !== id) : [...chosen, id]);

	function close() {
		open = false;
		query = '';
		chosen = [];
		confirming = false;
	}
</script>

<!--
	The form, rendered inside whichever dialog is asking.

	Not once outside them, which is what it was: a modal `<dialog>` makes the
	rest of the document inert, so a button in the dialog pointing at a form
	outside it submits nothing at all and the press looks like it missed. Each
	dialog carries its own copy, keyed by its own id.
-->
{#snippet linkForm(id: string)}
	<form
		{id}
		method="post"
		{action}
		use:enhance={() =>
			async ({ update, result }) => {
				const brought = chosen.length;
				// `invalidateAll` — the notebook's own lists are what changed, and
				// without it what arrived showed up only on the next page load.
				await update({ reset: false, invalidateAll: true });
				if (result.type === 'success') {
					close();
					say(t('notebooks.broughtNThings', { count: brought, notebook: notebookTitle }));
				}
			}}
	>
		<input type="hidden" name="module" value={module} />
		<input type="hidden" name="notebookId" value={notebookId} />
		{#each chosen as one (one)}
			<input type="hidden" name="id" value={one} />
		{/each}
	</form>
{/snippet}

<Modal {open} onclose={close} title={what} size="sm">
	<div class="space-y-3">
		<OneLine
			name="q"
			bind:value={query}
			placeholder={t('notebooks.searchToLink')}
			class="input w-full"
			autofocus
		/>
		<p class="text-xs text-gray-500">{t('notebooks.chooseWhatToBring')}</p>

		{#if candidates.items.length === 0}
			<EmptyState icon="link" title={t('notebooks.nothingLeftToLink')} compact />
		{:else if shown.length === 0}
			<p class="px-1 py-3 text-sm text-gray-500">{t('notebooks.nothingMatchesThat')}</p>
		{:else}
			<ul class="max-h-80 divide-y divide-gray-100 overflow-y-auto">
				{#each shown as one (one.id)}
					<li>
						<label
							class="flex w-full cursor-pointer items-center gap-2 px-1 py-2 text-left text-sm hover:bg-gray-50"
						>
							<input
								type="checkbox"
								class="size-4 shrink-0"
								checked={chosen.includes(one.id)}
								onchange={() => toggle(one.id)}
							/>
							<span class="min-w-0 flex-1 truncate text-gray-900">{one.label}</span>
							<!--
								Said out loud, because moving one is not the same as filing
								one: it comes off the subject it is under now.
							-->
							{#if one.elsewhere}
								<span class="eyebrow shrink-0 text-gray-500">
									{t('notebooks.inAnotherNotebook')}
								</span>
							{/if}
						</label>
					</li>
				{/each}
			</ul>
		{/if}

		{#if candidates.more}
			<p class="text-xs text-gray-500">{t('notebooks.onlyTheFirstAreListed')}</p>
		{/if}

		{@render linkForm('link-form')}
	</div>

	{#snippet footer()}
		<button type="button" class="btn" onclick={close}>{t('ui.cancel')}</button>
		<!--
			One button for the whole choice. It posts nothing itself where
			something would move: the warning is the press, and the form is
			behind it.
		-->
		{#if moving.length > 0}
			<button
				type="button"
				class="btn btn-primary"
				disabled={chosen.length === 0}
				onclick={() => (confirming = true)}
			>
				{t('notebooks.bringNThings', { count: chosen.length })}
			</button>
		{:else}
			<button type="submit" form="link-form" class="btn btn-primary" disabled={chosen.length === 0}>
				{t('notebooks.bringNThings', { count: chosen.length })}
			</button>
		{/if}
	{/snippet}
</Modal>

<!--
	What it costs, before it happens.

	A notebook holds the row rather than a copy of it, so bringing something in
	takes it off the subject it is under now. Named one by one, because "some of
	these live elsewhere" is a sentence nobody can act on.
-->
<Modal open={confirming} title={what} size="sm" onclose={() => (confirming = false)}>
	<div class="space-y-2">
		<p class="text-sm text-gray-900">{t('notebooks.theseLiveElsewhere')}</p>
		<ul class="list-inside list-disc space-y-1 text-sm text-gray-700">
			{#each moving as one (one.id)}
				<li class="truncate">{one.label}</li>
			{/each}
		</ul>

		{@render linkForm('link-confirm-form')}
	</div>

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (confirming = false)}>{t('ui.cancel')}</button>
		<button type="submit" form="link-confirm-form" class="btn btn-primary">
			{t('notebooks.proceed')}
		</button>
	{/snippet}
</Modal>
