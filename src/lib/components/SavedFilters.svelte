<script lang="ts">
	/**
	 * The narrowings this screen has kept, and the way to keep another.
	 *
	 * "Everything urgent about the house that nobody has done" is four controls
	 * set four ways, and setting them again every Monday is the work the
	 * controls were supposed to save.
	 *
	 * A saved filter is a name and the query string the list already writes
	 * into the address — see `$lib/filters-in-url` — so applying one is
	 * navigating to it. Nothing here knows what any of the controls are, which
	 * is what lets a filter saved today survive a control being added tomorrow.
	 *
	 * ## Why it is a picker and not a row of chips
	 *
	 * It was a chip each, with a × inside it. Three things were wrong with
	 * that and they are the same thing: the row said nothing about which of
	 * them you were looking at, the only way to change one was to delete it
	 * and save it again, and the only control on the chip after the name was
	 * the one that throws it away — a press away from the one you meant.
	 *
	 * A picker answers the first: what is chosen is what the list is showing,
	 * worked out by comparing the address rather than remembered, so it is
	 * still right after a reload or a link from somebody else. The pencil
	 * beside it answers the other two, and forgetting one is two presses
	 * inside a dialog rather than a cross in a row.
	 */
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import Picker from '$lib/components/Picker.svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { say } from '$lib/said.svelte';
	import { useT } from '$lib/i18n';

	const t = useT();

	let {
		/** Which screen these belong to: the task list's filters are not the diary's. */
		surface,
		/** Whether anything is narrowing the list right now — there is nothing to save otherwise. */
		narrowed = false
	}: { surface: string; narrowed?: boolean } = $props();

	type Saved = { name: string; query: string };

	let filters = $state<Saved[]>([]);
	let naming = $state(false);
	let name = $state('');

	/** Which one the pencil is open on, and what is being said about it. */
	let editing = $state<Saved | null>(null);
	let newName = $state('');
	/** Armed only by a first press, so forgetting one is never a single press. */
	let forgetting = $state(false);

	/*
	 * Fetched when the controls are first drawn rather than loaded with the
	 * page: most visits never open the filters, and this is a settings read per
	 * request for a row of chips nobody looked at.
	 */
	let asked = false;
	$effect(() => {
		if (asked) return;
		asked = true;
		fetch(`/api/saved-filters?surface=${encodeURIComponent(surface)}`)
			.then((res) => (res.ok ? res.json() : null))
			.then((got) => {
				if (got?.filters) filters = got.filters;
			})
			.catch(() => {});
	});

	/**
	 * What the list is narrowed to, read at the moment of the press.
	 *
	 * From the browser rather than from `page.url`: the filters write
	 * themselves into the address with `replaceState`, and `page.url` does not
	 * always carry that through to a component watching it — so a derived read
	 * of it was empty at exactly the moment somebody pressed Save, and the
	 * answer was "there is nothing to save" over a list that was plainly
	 * narrowed. There is nothing reactive wanted here anyway: this is one read
	 * on one press.
	 */
	const narrowingNow = () => window.location.search.replace(/^\?/, '');

	/**
	 * Which saved filter the list is showing, by what it is narrowed to.
	 *
	 * Compared rather than remembered, and compared as a *set* of parameters
	 * rather than as a string: the controls write them in whatever order they
	 * were pressed, so "done=show&tag=home" and "tag=home&done=show" are the
	 * same narrowing and have to read as the same one.
	 */
	const shape = (query: string) =>
		[...new URLSearchParams(query).entries()]
			.map(([k, v]) => `${k}=${v}`)
			.sort()
			.join('&');

	const chosen = $derived(
		filters.find((one) => shape(one.query) === shape(page.url.search))?.name ?? ''
	);

	const options = $derived([
		{ value: '', label: t('filters.noneChosen') },
		...filters.map((one) => ({ value: one.name, label: one.name }))
	]);

	/** Write the list back, whatever was done to it. Answers with what failed. */
	async function post(body: Record<string, unknown>): Promise<string | null> {
		const res = await fetch('/api/saved-filters', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ surface, ...body })
		}).catch(() => null);
		const got = await res?.json().catch(() => null);
		if (!res?.ok) return got?.message ?? t('filters.saveThese');
		filters = got?.filters ?? filters;
		return null;
	}

	async function keep() {
		const wanted = name.trim();
		if (!wanted) return;
		const failed = await post({ name: wanted, query: narrowingNow() });
		if (failed) return say(failed);
		naming = false;
		name = '';
	}

	function goTo(query: string) {
		// The screen's own path with a query on it, already resolved.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(`${page.url.pathname}${query ? `?${query}` : ''}`, { noScroll: true });
	}

	/** Picking one shows it; picking the empty row is the way back to everything. */
	function pick(next: string) {
		goTo(filters.find((one) => one.name === next)?.query ?? '');
	}

	function startEdit() {
		editing = filters.find((one) => one.name === chosen) ?? null;
		newName = editing?.name ?? '';
		forgetting = false;
	}

	/**
	 * Save what the dialog says, under whichever name it now has.
	 *
	 * A rename is a save under the new name and a forget of the old one, in
	 * that order — so a failure on the way leaves the filter as it was rather
	 * than leaving nothing.
	 */
	async function saveEdit(query: string) {
		if (!editing) return;
		const wanted = newName.trim();
		if (!wanted) return;

		const failed = await post({ name: wanted, query });
		if (failed) return say(failed);
		if (wanted !== editing.name) await post({ name: editing.name, remove: true });

		editing = null;
		goTo(query);
	}

	async function forget() {
		if (!editing) return;
		// A first press arms it, a second does it. A dialog is the place for
		// that: a cross in a row of chips is one slip from throwing one away.
		if (!forgetting) {
			forgetting = true;
			return;
		}
		const failed = await post({ name: editing.name, remove: true });
		if (failed) return say(failed);
		const gone = editing.name;
		editing = null;
		if (chosen === gone) goTo('');
	}
</script>

<!--
	Always here, whether or not there is anything to save.

	It used to appear the moment something narrowed the list — which put a row
	into the filter strip and pushed the list under it down, on the press that
	was supposed to be narrowing it. Pressing a control may not move the page.
	So the button is always drawn and is simply dead until there is something
	to keep.
-->
<div class="flex w-full flex-wrap items-center gap-2">
	<span class="eyebrow shrink-0 text-gray-500">{t('filters.saved')}</span>

	{#if filters.length > 0}
		<Picker
			value={chosen}
			{options}
			onpick={pick}
			label={t('filters.saved')}
			class="min-w-40 shrink-0"
		/>
		<!-- The pencil, on whichever one is showing. Dead rather than absent
		     while none is, so choosing one does not move the row. -->
		<button
			type="button"
			class="icon-btn"
			disabled={!chosen}
			title={t('filters.editFilter')}
			aria-label={t('filters.editFilter')}
			onclick={startEdit}
		>
			<Icon name="edit" size={14} />
		</button>
	{/if}

	{#if naming}
		<span class="flex min-w-0 items-center gap-1">
			<!-- A plain input: this names a filter rather than filling a field,
					     it posts nothing, and `OneLine` is a textarea for autofill's
					     sake — which is not a thing a one-word label wants. -->
			<!-- svelte-ignore a11y_autofocus -->
			<input
				type="text"
				bind:value={name}
				class="input h-8 w-40"
				placeholder={t('filters.nameThisFilter')}
				aria-label={t('filters.nameThisFilter')}
				maxlength="40"
				autocomplete="off"
				autofocus
				onkeydown={(event: KeyboardEvent) => {
					// Enter keeps it and Escape gives up, which is what a one-field
					// question is for; neither may reach the sheet around it.
					if (event.key === 'Enter') {
						event.preventDefault();
						event.stopPropagation();
						keep();
					} else if (event.key === 'Escape') {
						event.preventDefault();
						event.stopPropagation();
						naming = false;
						name = '';
					}
				}}
			/>
			<button type="button" class="btn btn-sm btn-primary" onclick={keep}>{t('ui.save')}</button>
		</span>
	{:else}
		<!-- Dead rather than absent: what it would do is worth seeing before
			     there is anything to do it to, and a button that arrives moves
			     everything under it. -->
		<button
			type="button"
			class="btn btn-sm"
			disabled={!narrowed}
			title={t('filters.savedFilterHint')}
			onclick={() => (naming = true)}
		>
			<Icon name="check" size={14} />
			{t('filters.saveThese')}
		</button>
	{/if}

	{#if filters.length === 0}
		<span class="text-xs text-gray-500">{t('filters.nothingSavedYet')}</span>
	{/if}
</div>

<!--
	What can be done to one, once there is one.

	Renaming, pointing it somewhere else, and throwing it away — all three of
	which had no answer at all: the chip carried its name and a cross.
-->
<Modal
	open={editing !== null}
	title={t('filters.editingFilter')}
	size="sm"
	onclose={() => (editing = null)}
>
	{#if editing}
		<div class="space-y-3">
			<label class="block">
				<span class="sr-only">{t('filters.nameThisFilter')}</span>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					type="text"
					bind:value={newName}
					class="input w-full"
					placeholder={t('filters.nameThisFilter')}
					aria-label={t('filters.nameThisFilter')}
					maxlength="40"
					autocomplete="off"
					autofocus
				/>
			</label>

			<!-- The other half of editing one: not what it is called, but what it
			     points at. Without this, adjusting a saved narrowing meant saving
			     a second one under the same name and hoping. -->
			<button
				type="button"
				class="btn btn-sm w-full"
				disabled={!narrowed}
				onclick={() => saveEdit(narrowingNow())}
			>
				{t('filters.updateToShowing')}
			</button>
		</div>
	{/if}

	{#snippet footer()}
		{#if editing}
			{@const one = editing}
			<button
				type="button"
				class="btn btn-sm mr-auto {forgetting ? 'btn-danger' : 'btn-quiet'}"
				onclick={forget}
			>
				{forgetting ? t('filters.forgetForGood') : t('filters.forgetIt')}
			</button>
			{#if forgetting}
				<span class="mr-auto text-xs text-gray-500">
					{t('filters.sureForget', { name: one.name })}
				</span>
			{/if}
			<button type="button" class="btn" onclick={() => (editing = null)}>{t('ui.cancel')}</button>
			<button type="button" class="btn btn-primary" onclick={() => saveEdit(one.query)}>
				{t('ui.save')}
			</button>
		{/if}
	{/snippet}
</Modal>
