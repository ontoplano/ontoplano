<script lang="ts">
	import { untrack } from 'svelte';

	import Icon from '$lib/components/Icon.svelte';
	import { useT } from '$lib/i18n';
	import type { PlainKey } from '$lib/i18n/keys';
	import { permissionRows, readNeededBy } from '$lib/scope-groups';

	/**
	 * What a key may do, as one grid: a row per thing, a column each for
	 * reading and writing.
	 *
	 * It is the one way the app draws permissions. There used to be three — a
	 * column of sentences on the key form, this grid on the assistant's form,
	 * and a paragraph of every sentence run together under each key in the list
	 * — so the same grant read differently depending on where it was looked at.
	 * Making a key, agreeing to an assistant's request and looking at a key
	 * already made all draw this; the last with `readonly`.
	 *
	 * The sentence each grant stands for is still there, as the row's title.
	 */
	type Choice = { key: string; says: PlainKey | null; caution: PlainKey | null };

	let {
		scopes,
		checked = [],
		readonly = false,
		reachable = null,
		destructive = false,
		showKeys = false,
		name = 'scopes'
	}: {
		/** The grants this screen offers, or the key holds. */
		scopes: Choice[];
		/** Ticked to begin with — and, read-only, what the key holds. */
		checked?: string[];
		/** Draw the answer instead of asking the question. */
		readonly?: boolean;
		/**
		 * What a confinement leaves within reach, or null for the whole account.
		 * The rest are drawn faint rather than removed, so the grid does not jump
		 * as somebody changes what the key is tied to.
		 */
		reachable?: string[] | null;
		/** Offer deleting, apart from the rest and unticked. */
		destructive?: boolean;
		/** Put `bills:write` in the row's title, for somebody wiring up a script. */
		showKeys?: boolean;
		/** The field name the boxes post under. */
		name?: string;
	} = $props();

	const t = useT();

	const rows = $derived(permissionRows(scopes.map((one) => one.key)));
	const choice = (key: string | null) => scopes.find((one) => one.key === key) ?? null;
	const reaches = (key: string | null) => !key || !reachable || reachable.includes(key);

	/*
	 * Read once, deliberately: the list a form offers does not change while
	 * somebody is filling it in, and re-deriving this would throw away every
	 * tick they had made.
	 */
	let ticked = $state<Record<string, boolean>>(
		untrack(() =>
			Object.fromEntries(
				[...scopes.map((one) => one.key), 'destructive'].map((key) => [key, checked.includes(key)])
			)
		)
	);

	/**
	 * Tick exactly these and untick the rest.
	 *
	 * Set rather than add, so pressing a preset twice is the same as pressing it
	 * once. Exported because the presets belong to the page — "an AI assistant"
	 * means nothing on the consent screen, where an assistant is who is asking.
	 */
	export function tick(keys: string[]) {
		for (const key of Object.keys(ticked)) ticked[key] = keys.includes(key);
	}

	/** What is ticked now, for a parent that needs to know before the post. */
	export function ticks(): string[] {
		return Object.keys(ticked).filter((key) => ticked[key]);
	}

	/*
	 * Writing a room needs reading it, so a ticked write holds its read on: the
	 * read box shows ticked and cannot be unticked while the write is. The server
	 * adds it anyway, and a box that could say otherwise would be a box that lies.
	 */
	const heldBy = (key: string) =>
		scopes.find((one) => ticked[one.key] && readNeededBy(one.key) === key)?.key ?? null;

	$effect(() => {
		for (const one of scopes) {
			const read = readNeededBy(one.key);
			if (ticked[one.key] && read && read in ticked && !ticked[read]) ticked[read] = true;
		}
	});

	const titleOf = (row: { read: string | null; write: string | null }) =>
		[row.read, row.write]
			.map(choice)
			.filter((one) => one !== null)
			.map((one) => {
				const says = one.says ? t(one.says) : one.key;
				return showKeys ? `${one.key} — ${says}` : says;
			})
			.join('\n');

	/*
	 * Everything at once, by column or in all. A column's box is ticked when
	 * every grant in it that this key can reach is, and half-ticked when some
	 * are. Unticking every read takes the writes with it, because a write holds
	 * its read on and the column could not otherwise be emptied.
	 */
	const column = (i: number) =>
		rows
			.map((row) => (i === 0 ? row.read : row.write))
			.filter((key): key is string => key !== null && reaches(key));
	const every = (keys: string[]) => keys.length > 0 && keys.every((key) => ticked[key]);
	const some = (keys: string[]) => keys.some((key) => ticked[key]);
	function setColumn(i: number, on: boolean) {
		for (const key of column(i)) ticked[key] = on;
		if (i === 0 && !on) for (const key of column(1)) ticked[key] = false;
	}
	const both = $derived([...column(0), ...column(1)]);

	const verb = (i: number) => (i === 0 ? 'read' : 'write');
	const verbWord = (i: number) => (i === 0 ? t('ui.read') : t('ui.write'));
</script>

<div class="max-w-md overflow-x-auto">
	<table class="w-full text-sm">
		<thead>
			<tr class="border-b border-gray-200">
				<th class="py-1 text-left font-normal text-gray-500">
					{#if !readonly}
						<label class="inline-flex items-center gap-2 text-xs text-gray-600">
							<input
								type="checkbox"
								checked={every(both)}
								indeterminate={some(both) && !every(both)}
								onchange={(event) => {
									const on = event.currentTarget.checked;
									setColumn(1, on);
									setColumn(0, on);
								}}
							/>
							{t('settings.integrations.allOfIt')}
						</label>
					{/if}
				</th>
				{#each [0, 1] as i (i)}
					{@const keys = column(i)}
					<th class="eyebrow w-16 py-1 text-center text-gray-600">
						{#if readonly}
							{i === 0 ? t('settings.integrations.read') : t('settings.integrations.write')}
						{:else}
							<label class="flex flex-col items-center gap-1">
								{i === 0 ? t('settings.integrations.read') : t('settings.integrations.write')}
								<input
									type="checkbox"
									checked={every(keys)}
									indeterminate={some(keys) && !every(keys)}
									onchange={(event) => setColumn(i, event.currentTarget.checked)}
									aria-label={i === 0
										? t('settings.integrations.everyRead')
										: t('settings.integrations.everyWrite')}
								/>
							</label>
						{/if}
					</th>
				{/each}
			</tr>
		</thead>
		<tbody class="divide-y divide-gray-200">
			{#each rows as row (row.subject)}
				{@const label = row.label ? t(row.label) : row.subject}
				{@const cautions = [row.read, row.write]
					.map(choice)
					.filter((one) => one?.caution && ticked[one.key] && reaches(one.key))}
				<tr class={reaches(row.read ?? row.write) ? '' : 'opacity-40'} data-subject={row.subject}>
					<td class="py-1.5 text-gray-700" title={titleOf(row)}>{label}</td>
					{#each [row.read, row.write] as scope, i (i)}
						<td class="py-1.5 text-center">
							{#if readonly}
								<!-- An answer, not a control: a tick where it is granted and an
								     empty box where it is not, so the columns still read. -->
								{#if scope && ticked[scope]}
									<span
										class="inline-flex size-4 items-center justify-center bg-gray-900 align-middle text-white"
										role="img"
										aria-label="{label}: {verbWord(i)}"
										data-granted={scope}><Icon name="check" size={12} /></span
									>
								{:else if scope}
									<span
										class="inline-block size-4 border border-gray-300 align-middle"
										aria-hidden="true"
									></span>
								{/if}
							{:else if scope && reaches(scope)}
								<input
									type="checkbox"
									{name}
									value={scope}
									bind:checked={ticked[scope]}
									disabled={heldBy(scope) !== null}
									title={heldBy(scope) ? t('scopeGroups.neededToWrite') : undefined}
									aria-label="{label}: {verbWord(i)}"
								/>
							{:else if scope}
								<input
									type="checkbox"
									disabled
									aria-label={t('settings.integrations.outsideWhat', {
										label,
										write: verb(i)
									})}
								/>
							{:else}
								<input
									type="checkbox"
									disabled
									aria-label={t('settings.integrations.notSomething', {
										label,
										write: verb(i)
									})}
								/>
							{/if}
						</td>
					{/each}
				</tr>
				{#each cautions as one (one!.key)}
					<!-- Only once the tick is in: a warning about a grant nobody is
					     granting is noise. -->
					<tr>
						<td colspan="3" class="pb-1.5">
							<span
								class="block border-l-2 border-amber-600 pl-2 text-xs font-medium text-amber-700"
								>{t(one!.caution!)}</span
							>
						</td>
					</tr>
				{/each}
			{/each}
		</tbody>
	</table>
</div>
{#if destructive && readonly}
	{#if ticked.destructive}
		<p class="mt-3 flex max-w-md items-center gap-1.5 text-sm font-semibold text-gray-900">
			<Icon name="warning" size={14} />{t('scopeGroups.removingThings')}
		</p>
	{/if}
{:else if destructive}
	<!--
		Deleting, apart from the rest and unticked, on the danger ground. The
		words stay dark: small red text is the one place colour cannot carry
		meaning for everyone; the tint and the glyph say it.
	-->
	<label
		class="mt-3 flex max-w-md items-start gap-2 border border-red-200 bg-red-50 px-3 py-2 text-sm text-gray-700"
	>
		<input
			type="checkbox"
			{name}
			value="destructive"
			class="mt-0.5"
			bind:checked={ticked.destructive}
		/>
		<span>
			<strong class="flex items-center gap-1.5 font-semibold text-gray-900"
				><Icon name="warning" size={14} />{t('settings.integrations.andLetItDeleteThings')}</strong
			>
			<span class="mt-0.5 block text-xs leading-relaxed text-gray-600">
				{t('settings.integrations.removingIsPermanentWithoutThis')}
			</span>
		</span>
	</label>
{/if}
