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
	 * It sits with the controls rather than beside them: this is the same
	 * question they answer, asked once and remembered.
	 */
	import Icon from '$lib/components/Icon.svelte';
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

	async function keep() {
		const wanted = name.trim();
		if (!wanted) return;
		const query = narrowingNow();

		const res = await fetch('/api/saved-filters', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ surface, name: wanted, query })
		}).catch(() => null);

		const got = await res?.json().catch(() => null);
		if (!res?.ok) {
			say(got?.message ?? t('filters.saveThese'));
			return;
		}
		filters = got?.filters ?? filters;
		naming = false;
		name = '';
	}

	async function forget(one: Saved) {
		const res = await fetch('/api/saved-filters', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ surface, name: one.name, remove: true })
		}).catch(() => null);
		const got = await res?.json().catch(() => null);
		if (got?.filters) filters = got.filters;
	}

	function apply(one: Saved) {
		// The screen's own path with a query on it, already resolved.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(`${page.url.pathname}${one.query ? `?${one.query}` : ''}`, { noScroll: true });
	}
</script>

{#if filters.length > 0 || narrowed}
	<div class="col-span-full flex w-full flex-wrap items-center gap-2">
		{#if filters.length > 0}
			<span class="eyebrow shrink-0 text-gray-500">{t('filters.saved')}</span>
		{/if}

		{#each filters as one (one.name)}
			<!-- The name is the button and the cross is inside it, the way a tag
			     chip carries its own way off. -->
			<span class="chip inline-flex items-center gap-1">
				<button
					type="button"
					class="min-w-0 truncate"
					aria-label={t('filters.applyFilter', { name: one.name })}
					onclick={() => apply(one)}
				>
					{one.name}
				</button>
				<button
					type="button"
					class="opacity-60 transition hover:opacity-100"
					aria-label={t('filters.forgetFilter', { name: one.name })}
					title={t('filters.forgetFilter', { name: one.name })}
					onclick={() => forget(one)}
				>
					<Icon name="close" size={12} />
				</button>
			</span>
		{/each}

		{#if narrowed}
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
					<button type="button" class="btn btn-sm btn-primary" onclick={keep}>{t('ui.save')}</button
					>
				</span>
			{:else}
				<button type="button" class="btn btn-sm" onclick={() => (naming = true)}>
					<Icon name="check" size={14} />
					{t('filters.saveThese')}
				</button>
			{/if}
		{/if}
	</div>
{/if}
