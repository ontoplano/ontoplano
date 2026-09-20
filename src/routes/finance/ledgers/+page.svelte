<script lang="ts">
	import { monthOf } from '$lib/when';
	import { useWhen } from '$lib/when-context.svelte';
	import { enhance } from '$app/forms';
	import Swatch from '$lib/components/Swatch.svelte';
	import RoomToolbar from '$lib/components/RoomToolbar.svelte';
	import { setRoomAction } from '$lib/room-action.svelte';
	import { CSV_PARSER_KEY, sniffCsv, type CsvMapping } from '$lib/bank-parsers';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import { armed } from '$lib/actions/armed';
	import { formatMoney, type Currency } from '$lib/money';
	import { LEDGER_KIND_LABELS, LEDGER_KINDS } from '$lib/services/ledgers';
	import type { PageServerData, ActionData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();
	const now = useWhen();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	const currency = $derived(data.currency as Currency);

	/**
	 * How much of its category's colour a line's row carries.
	 *
	 * A category is meant to be legible as a wash across the whole row, not
	 * only as the dot beside its name. Hex alpha rather than an opacity: the
	 * text on the row must not fade with the background. It was 8%, which is
	 * invisible on a dark screen.
	 */
	const CATEGORY_WASH_ALPHA = '2b';

	/** `2026-02` as somebody would say it. */
	const monthName = (key: string) => monthOf(key, now(), { month: 'long', year: 'numeric' });
	const money = (cents: number) => formatMoney(cents, currency);

	type Ledger = PageServerData['ledgers'][number];
	type Movement = PageServerData['movements'][number];

	const active = $derived(data.ledgers.filter((l) => !l.archived));
	const archived = $derived(data.ledgers.filter((l) => l.archived));

	let showNewLedger = $state(false);
	let editingLedger: Ledger | null = $state(null);
	let deletingLedger: Ledger | null = $state(null);
	let showArchived = $state(false);

	let showImport = $state(false);
	let statementText = $state('');

	/*
	 * Which export was chosen, and — for the generic one — what its columns are.
	 *
	 * Sniffed in the browser rather than on a round trip: the file is already
	 * here, the answer is needed the moment it arrives, and a person correcting
	 * a guess should not be waiting on a server to find out it was wrong.
	 */
	let source = $state('');
	const sniffed = $derived(
		source === CSV_PARSER_KEY && statementText.trim() ? sniffCsv(statementText) : null
	);

	/** The guess, and then whatever it has been corrected to. */
	let mapping = $state<CsvMapping | null>(null);
	$effect(() => {
		mapping = sniffed ? { ...sniffed.mapping } : null;
	});

	/** A column that is not named is absent, not the empty string. */
	function nameColumn(field: 'amount' | 'moneyIn' | 'moneyOut' | 'id', value: string) {
		if (!mapping) return;
		mapping = { ...mapping, [field]: value || undefined };
	}
	let importForm: HTMLFormElement | undefined = $state();

	let showNewMovement = $state(false);
	let editingId: number | null = $state(null);
	const editing = $derived(
		editingId === null ? null : (data.movements.find((m) => m.id === editingId) ?? null)
	);
	let deletingMovement: Movement | null = $state(null);

	/** Choosing the file is the submit; it is read here and posted as text. */
	async function fileChosen(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		statementText = await file.text();
		input.value = '';
		importForm?.requestSubmit();
	}

	function show(ledgerId: number) {
		// The path is resolved; the rule cannot see through the appended query.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(`${resolve('/finance/ledgers')}?ledger=${ledgerId}`, { noScroll: true });
	}

	/** The filters ride the URL, so a view can be kept open or shared. */
	function filter(changes: { q?: string; month?: string }) {
		const params: [string, string][] = [];
		if (data.current) params.push(['ledger', String(data.current.id)]);
		const q = changes.q ?? data.query;
		const month = changes.month ?? data.month;
		if (q) params.push(['q', String(q)]);
		if (month) params.push(['month', String(month)]);
		// The path is resolved; the rule cannot see through the appended query.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(`${resolve('/finance/ledgers')}?${new URLSearchParams(params)}`, {
			noScroll: true,
			keepFocus: true
		});
	}

	const dayOf = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

	/*
	 * Which rows start a year.
	 *
	 * A statement is read as DD/MM and nothing on the row says which year —
	 * fine until the list crosses new year's, where 31/12 sits above 01/01
	 * and they are twelve months apart. A band across the list says which
	 * year the rows under it belong to, the way a bank statement does. The
	 * first row gets one too: the newest year is a fact worth stating rather
	 * than leaving to be inferred from the ones below.
	 */
	const yearBands = $derived(
		new Map(
			data.movements
				.map((m, i) => [
					m.id,
					i === 0 || m.occurredOn.slice(0, 4) !== data.movements[i - 1].occurredOn.slice(0, 4)
						? m.occurredOn.slice(0, 4)
						: null
				])
				.filter((entry): entry is [number, string] => entry[1] !== null)
		)
	);
	const asDecimal = (cents: number) => (Math.abs(cents) / 100).toFixed(2);
	const today = new Date().toISOString().slice(0, 10);

	/* This screen's one verb, drawn by the room's bar — see $lib/room-action. */
	setRoomAction(() => ({
		label: t('finance.ledgers.newLedger'),
		run: () => (showNewLedger = true)
	}));
</script>

<div class="space-y-4">
	<RoomToolbar>
		{#snippet tools()}
			{#each active as ledger (ledger.id)}
				<!--
				One ledger, as a tile you can read at a glance: what it is
				called over what it holds. Written as two lines rather than
				four things strung across one, because on a phone the strung
				version ran two ledgers into each other and off the screen.
			-->
				<button
					class="flex min-w-36 shrink-0 flex-col items-start gap-0.5 rounded border px-3 py-2 text-left transition-colors {data
						.current?.id === ledger.id
						? 'border-gray-900 bg-gray-50'
						: 'border-gray-200 hover:border-gray-400'}"
					onclick={() => show(ledger.id)}
				>
					<span class="w-full truncate text-sm font-medium text-gray-900">{ledger.name}</span>
					<span class="flex w-full items-baseline gap-2">
						<span class="text-xs text-gray-500">{t(LEDGER_KIND_LABELS[ledger.kind])}</span>
						<span class="text-xs text-gray-400 tabular-nums">{ledger.count}</span>
						<span
							class="ml-auto text-xs tabular-nums {ledger.balanceCents < 0
								? 'text-red-600'
								: 'text-blue-700'}"
						>
							{money(ledger.balanceCents)}
						</span>
					</span>
				</button>
			{/each}
			{#if archived.length > 0}
				<button
					class="text-xs text-gray-500 hover:text-gray-700"
					onclick={() => (showArchived = !showArchived)}
					>{t('finance.ledgers.archived', {
						show: showArchived ? t('ui.hide') : t('ui.show'),
						length: archived.length
					})}</button
				>
			{/if}
		{/snippet}
	</RoomToolbar>

	{#if showArchived && archived.length > 0}
		<ul class="divide-y divide-gray-100 rounded border border-gray-200">
			{#each archived as ledger (ledger.id)}
				<li class="flex items-center gap-3 px-3 py-2 text-sm">
					<span class="min-w-0 flex-1 truncate text-gray-600">{ledger.name}</span>
					<span class="text-xs text-gray-400 tabular-nums"
						>{t('finance.ledgers.lines', { count: ledger.count })}</span
					>
					<form method="post" action="?/archiveLedger" use:enhance>
						<input type="hidden" name="id" value={ledger.id} />
						<input type="hidden" name="archived" value="false" />
						<button class="btn btn-sm" type="submit">{t('finance.ledgers.restore')}</button>
					</form>
					<button
						class="icon-btn"
						aria-label={t('finance.ledgers.delete', { name: ledger.name })}
						onclick={() => (deletingLedger = ledger)}
					>
						<Icon name="trash" />
					</button>
				</li>
			{/each}
		</ul>
	{/if}

	<FormError message={form?.message} />

	{#if !data.current}
		<EmptyState
			icon="wallet"
			title={t('finance.ledgers.noLedgersYet')}
			description={t('finance.ledgers.aLedgerIsOnePlace')}
		/>
	{:else}
		{@const current = data.current}
		<!--
			One surface, top to bottom, rather than three things in a field.

			The ledger's name, what narrows it and the lines themselves are one
			statement read downwards, and they were drawn as a box, a loose row of
			controls on the page's own ground, and a second box. The table had no
			background of its own either, so the page showed through every row a
			category had washed — which is what made the colour look like it was
			painted straight onto the ground. One white surface now, with a rule
			under each band.
		-->
		<div class="border border-gray-200 bg-white shadow-card">
			<!-- What this ledger is, and what can be done to it. -->
			<div class="flex flex-wrap items-center gap-2 border-b border-gray-200 px-3 py-2">
				<span class="text-sm font-semibold text-gray-900">{current.name}</span>
				<span class="text-xs text-gray-500">
					{t(LEDGER_KIND_LABELS[current.kind])}{current.lastOn ? ` · last ${current.lastOn}` : ''}
				</span>
				{#if data.unsorted > 0}
					<a
						href={resolve('/finance/rules')}
						class="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800"
						>{t('finance.ledgers.uncategorized', { unsorted: data.unsorted })}</a
					>
				{/if}
				<!-- On a phone these are the row, not an afterthought pushed right. -->
				<span class="flex w-full items-center gap-1 sm:ml-auto sm:w-auto">
					<!-- The ledger's own default, or the generic reader: opening the
					     screen with nothing chosen would make the first thing anybody
					     does be choosing something they have no opinion about yet. -->
					<button
						class="btn btn-sm"
						onclick={() => {
							source = data.current?.defaultParser || CSV_PARSER_KEY;
							showImport = true;
						}}
					>
						<Icon name="download" />
						{t('finance.ledgers.import')}
					</button>
					<button class="btn btn-sm" onclick={() => (showNewMovement = true)}>
						<Icon name="plus" />
						{t('finance.ledgers.line')}
					</button>
					<button
						class="icon-btn"
						aria-label={t('finance.ledgers.edit', { name: current.name })}
						onclick={() => (editingLedger = current)}
					>
						<Icon name="edit" />
					</button>
					<form method="post" action="?/moveLedger" use:enhance>
						<input type="hidden" name="id" value={current.id} />
						<input type="hidden" name="delta" value="-1" />
						<button
							class="icon-btn"
							aria-label={t('finance.ledgers.moveEarlier', { name: current.name })}
						>
							<Icon name="chevron-up" />
						</button>
					</form>
					<form method="post" action="?/moveLedger" use:enhance>
						<input type="hidden" name="id" value={current.id} />
						<input type="hidden" name="delta" value="1" />
						<button
							class="icon-btn"
							aria-label={t('finance.ledgers.moveLater', { name: current.name })}
						>
							<Icon name="chevron-down" />
						</button>
					</form>
					<form method="post" action="?/archiveLedger" use:enhance>
						<input type="hidden" name="id" value={current.id} />
						<input type="hidden" name="archived" value="true" />
						<button
							class="icon-btn"
							aria-label={t('finance.ledgers.archive', { name: current.name })}
							title={t('finance.ledgers.putItAway')}
						>
							<Icon name="archive" />
						</button>
					</form>
					<button
						class="icon-btn"
						aria-label={t('finance.ledgers.delete', { name: current.name })}
						onclick={() => (deletingLedger = current)}
					>
						<Icon name="trash" />
					</button>
				</span>
			</div>

			<!-- Finding one line among a year of them. -->
			<div class="flex flex-wrap items-center gap-2 border-b border-gray-200 px-3 py-2">
				<input
					value={data.query}
					placeholder={t('finance.ledgers.searchDescriptions')}
					class="input w-56"
					oninput={(e) => filter({ q: (e.currentTarget as HTMLInputElement).value })}
				/>
				<!--
					The months this ledger has, not a date field.

					`input type="month"` is a picker in Chromium and a bare text box in
					Firefox, where typing "2" filters to nothing and the box explains
					nothing. A list of the months there is something to look at is
					native everywhere, and shorter.
				-->
				<select
					class="select w-auto"
					aria-label={t('finance.ledgers.month')}
					value={data.month}
					onchange={(e) => filter({ month: (e.currentTarget as HTMLSelectElement).value })}
				>
					<option value="">{t('finance.ledgers.everyMonth')}</option>
					{#each data.months as m (m)}
						<option value={m}>{monthName(m)}</option>
					{/each}
				</select>
				{#if data.query || data.month}
					<button class="btn btn-sm" onclick={() => filter({ q: '', month: '' })}
						>{t('finance.ledgers.clear')}</button
					>
				{/if}
				<span class="ml-auto text-xs text-gray-500 tabular-nums"
					>{t('finance.ledgers.shown', { length: data.movements.length })}</span
				>
			</div>

			{#if data.movements.length === 0}
				<EmptyState
					icon="wallet"
					title={t('finance.ledgers.nothingHereYet')}
					description={t('finance.ledgers.importThisLedgerSExportOr')}
				/>
			{:else}
				<!-- The list scrolls inside itself: a year of a card's statement is
				     hundreds of rows, and the ledger switcher must stay reachable. -->
				<!--
					A statement is a table on a desktop and a list on a phone.
					Six columns across 390px squeezed the amount off the right and
					stood the tag chips on their heads — "# p ix" down the side of
					the screen. The same rows, laid out twice: the table below the
					`sm` breakpoint is replaced by a block per movement, with the
					day and the description on the first line and everything that
					sorts it on the second.
				-->
				<ul class="max-h-[70vh] divide-y divide-gray-100 overflow-y-auto sm:hidden">
					{#each data.movements as m (m.id)}
						{#if yearBands.has(m.id)}
							<li
								class="bg-gray-50 px-4 py-1 text-center text-xs font-medium tracking-widest text-gray-500 tabular-nums"
							>
								{yearBands.get(m.id)}
							</li>
						{/if}
						<li
							class="px-4 py-2.5"
							style={m.categoryColor
								? `background-color: ${m.categoryColor}${CATEGORY_WASH_ALPHA}`
								: ''}
						>
							<div class="flex items-baseline gap-2">
								<span class="shrink-0 text-xs text-gray-500 tabular-nums">
									{dayOf(m.occurredOn)}
								</span>
								<span class="min-w-0 flex-1 truncate text-gray-900" title={m.description}>
									{m.description}
								</span>
								<span
									class="shrink-0 tabular-nums {m.amountCents >= 0
										? 'text-blue-700'
										: 'text-gray-900'}"
								>
									{money(m.amountCents)}
								</span>
							</div>
							<div class="mt-1 flex items-center gap-2">
								{#if m.category}
									<span
										class="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium"
										style="color: {m.categoryColor}"
									>
										<Swatch color={m.categoryColor ?? '#6b7280'} shape="dot" />
										{m.category}
									</span>
								{/if}
								<span class="flex min-w-0 flex-1 flex-wrap gap-1">
									{#each m.tags as tag (tag.name)}
										<span
											class="rounded-full px-1.5 py-0.5 text-xs whitespace-nowrap"
											style="background-color: {tag.color}1f; color: {tag.color}"
										>
											#{tag.name}
										</span>
									{/each}
								</span>
								<button
									class="icon-btn shrink-0"
									aria-label={t('finance.ledgers.editThisLine')}
									onclick={() => (editingId = m.id)}
								>
									<Icon name="edit" />
								</button>
								<button
									class="icon-btn shrink-0"
									aria-label={t('finance.ledgers.deleteThisLine')}
									onclick={() => (deletingMovement = m)}
								>
									<Icon name="trash" />
								</button>
							</div>
						</li>
					{/each}
				</ul>

				<div class="hidden max-h-[60vh] overflow-y-auto sm:block">
					<table class="statement w-full text-sm">
						<thead class="sticky top-0 bg-white">
							<tr class="border-b border-gray-200 text-left text-xs text-gray-500">
								<th class="px-3 py-2 font-medium">{t('finance.ledgers.day')}</th>
								<th class="px-3 py-2 font-medium">{t('ui.description')}</th>
								<th class="px-3 py-2 font-medium">{t('ui.category')}</th>
								<th class="px-3 py-2 font-medium">{t('ui.tags')}</th>
								<th class="px-3 py-2 text-right font-medium">{t('ui.amount')}</th>
								<th class="px-3 py-2"><span class="sr-only">{t('ui.actions')}</span></th>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-100">
							{#each data.movements as m (m.id)}
								{#if yearBands.has(m.id)}
									<tr class="bg-gray-50">
										<td
											colspan="6"
											class="px-3 py-1 text-center text-xs font-medium tracking-widest text-gray-500 tabular-nums"
										>
											{yearBands.get(m.id)}
										</td>
									</tr>
								{/if}
								<tr
									style={m.categoryColor
										? `background-color: ${m.categoryColor}${CATEGORY_WASH_ALPHA}`
										: ''}
								>
									<td class="px-3 py-2 whitespace-nowrap text-gray-500 tabular-nums">
										{dayOf(m.occurredOn)}
									</td>
									<td class="max-w-xs truncate px-3 py-2 text-gray-900" title={m.description}>
										{m.description}
									</td>
									<td class="px-3 py-2 whitespace-nowrap">
										{#if m.category}
											<span
												class="inline-flex items-center gap-1.5 text-xs font-medium"
												style="color: {m.categoryColor}"
											>
												<Swatch color={m.categoryColor ?? '#6b7280'} shape="dot" />
												{m.category}
											</span>
										{:else}
											<span class="text-xs text-gray-400">—</span>
										{/if}
									</td>
									<td class="px-3 py-2">
										<span class="flex flex-wrap gap-1">
											{#each m.tags as tag (tag.name)}
												<span
													class="rounded-full px-1.5 py-0.5 text-xs"
													style="background-color: {tag.color}1f; color: {tag.color}"
												>
													#{tag.name}
												</span>
											{/each}
										</span>
									</td>
									<td
										class="px-3 py-2 text-right whitespace-nowrap tabular-nums {m.amountCents >= 0
											? 'text-blue-700'
											: 'text-gray-900'}"
									>
										{money(m.amountCents)}
									</td>
									<td class="px-3 py-2 text-right whitespace-nowrap">
										<button
											class="icon-btn"
											aria-label={t('finance.ledgers.editThisLine')}
											onclick={() => (editingId = m.id)}
										>
											<Icon name="edit" />
										</button>
										<button
											class="icon-btn"
											aria-label={t('finance.ledgers.deleteThisLine')}
											onclick={() => (deletingMovement = m)}
										>
											<Icon name="trash" />
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	{/if}

	<p class="text-xs text-gray-500">
		{t('finance.ledgers.moneyYouExpectRatherThan')}
		<a href={resolve('/finance/bills')} class="underline">{t('finance.ledgers.bill')}</a>{t(
			'finance.ledgers.andBillsTurnUp'
		)}
	</p>
</div>

<!-- New ledger. -->
<Modal
	bind:open={showNewLedger}
	error={form?.message}
	title={t('finance.ledgers.newLedger')}
	size="sm"
>
	<form
		id="ledger-form"
		method="post"
		action="?/createLedger"
		use:enhance={() =>
			({ result, update }) => {
				if (result.type === 'success') showNewLedger = false;
				return update({ reset: result.type === 'success' });
			}}
	>
		<div class="grid gap-3">
			<label class="block text-sm">
				<span class="text-gray-600">{t('ui.name')}</span>
				<OneLine
					name="heading"
					placeholder={t('finance.ledgers.currentAccount')}
					class="input mt-1 w-full"
					required
					autofocus
				/>
			</label>
			<label class="block text-sm">
				<span class="text-gray-600">{t('finance.ledgers.whatItIs')}</span>
				<select name="kind" class="select mt-1 w-full">
					{#each LEDGER_KINDS as kind (kind)}
						<option value={kind}>{t(LEDGER_KIND_LABELS[kind])}</option>
					{/each}
				</select>
			</label>
			<label class="block text-sm">
				<span class="text-gray-600">{t('finance.ledgers.usualExport')}</span>
				<select name="defaultParser" class="select mt-1 w-full">
					<option value="">{t('finance.ledgers.askEveryTime')}</option>
					{#each data.parsers as p (p.key)}<option value={p.key}>{p.name}</option>{/each}
				</select>
				<span class="mt-1 block text-xs text-gray-500">
					{t('finance.ledgers.preselectedWhenImportingIntoThis')}
				</span>
			</label>
		</div>
	</form>
	{#snippet footer()}
		<button class="btn" type="button" onclick={() => (showNewLedger = false)}
			>{t('ui.cancel')}</button
		>
		<button class="btn btn-primary" type="submit" form="ledger-form">{t('ui.create')}</button>
	{/snippet}
</Modal>

<!-- Edit ledger. -->
<Modal
	open={editingLedger !== null}
	error={form?.message}
	title={t('finance.ledgers.editLedger')}
	onclose={() => (editingLedger = null)}
	size="sm"
>
	{#if editingLedger}
		<form
			id="ledger-edit"
			method="post"
			action="?/updateLedger"
			use:enhance={() =>
				({ result, update }) => {
					if (result.type === 'success') editingLedger = null;
					return update();
				}}
		>
			<input type="hidden" name="id" value={editingLedger.id} />
			<div class="grid gap-3">
				<label class="block text-sm">
					<span class="text-gray-600">{t('ui.name')}</span>
					<OneLine name="heading" value={editingLedger.name} class="input mt-1 w-full" required />
				</label>
				<label class="block text-sm">
					<span class="text-gray-600">{t('finance.ledgers.whatItIs')}</span>
					<select name="kind" class="select mt-1 w-full" value={editingLedger.kind}>
						{#each LEDGER_KINDS as kind (kind)}
							<option value={kind}>{t(LEDGER_KIND_LABELS[kind])}</option>
						{/each}
					</select>
				</label>
				<label class="block text-sm">
					<span class="text-gray-600">{t('finance.ledgers.usualExport')}</span>
					<select
						name="defaultParser"
						class="select mt-1 w-full"
						value={editingLedger.defaultParser ?? ''}
					>
						<option value="">{t('finance.ledgers.askEveryTime')}</option>
						{#each data.parsers as p (p.key)}<option value={p.key}>{p.name}</option>{/each}
					</select>
				</label>
			</div>
		</form>
	{/if}
	{#snippet footer()}
		<button class="btn" type="button" onclick={() => (editingLedger = null)}
			>{t('ui.cancel')}</button
		>
		<button class="btn btn-primary" type="submit" form="ledger-edit">{t('ui.save')}</button>
	{/snippet}
</Modal>

<!-- Delete ledger. -->
<Modal
	open={deletingLedger !== null}
	title={t('finance.ledgers.deleteThisLedger')}
	onclose={() => (deletingLedger = null)}
	size="sm"
>
	{#if deletingLedger}
		<p class="text-sm text-gray-600">
			<strong>{deletingLedger.name}</strong>{t('finance.ledgers.andItsLinesGoFor', {
				count: deletingLedger.count
			})}
		</p>
	{/if}
	{#snippet footer()}
		<button class="btn" type="button" onclick={() => (deletingLedger = null)}
			>{t('finance.ledgers.keepIt')}</button
		>
		<form
			method="post"
			action="?/deleteLedger"
			use:enhance={() =>
				({ result, update }) => {
					if (result.type === 'success') deletingLedger = null;
					return update();
				}}
		>
			<input type="hidden" name="id" value={deletingLedger?.id} />
			<button class="btn btn-danger" type="submit" use:armed>{t('ui.delete')}</button>
		</form>
	{/snippet}
</Modal>

<!-- Import into this ledger. -->
<Modal bind:open={showImport} error={form?.message} title={t('finance.ledgers.importAStatement')}>
	{#if data.current}
		<form
			method="post"
			action="?/import"
			bind:this={importForm}
			use:enhance={() =>
				({ result, update }) => {
					if (result.type === 'success') statementText = '';
					return update({ reset: false });
				}}
		>
			<input type="hidden" name="ledgerId" value={data.current.id} />
			<div class="grid gap-3">
				<label class="block text-sm">
					<span class="text-gray-600">{t('finance.ledgers.export')}</span>
					<select name="source" class="select mt-1 w-full" bind:value={source}>
						{#each data.parsers as p (p.key)}<option value={p.key}>{p.name}</option>{/each}
					</select>
				</label>

				<!--
					What the columns are, when the file is anybody's CSV.
					
					Shown filled in rather than blank: the guess is right most of the
					time and the work is confirming it, not doing it. Every control
					here is the same list — the file's own headers — because the
					question is always "which of these is it", and a free text box
					would be asking somebody to type a header name they can see.
				-->
				{#if sniffed && mapping}
					{@const headers = sniffed.headers}
					<div class="grid gap-2 border border-gray-200 bg-gray-50 p-3">
						<p class="text-xs text-gray-600">
							{sniffed.headerless
								? t('finance.ledgers.noHeaderRowSoThe')
								: t('finance.ledgers.readFromTheHeaderChange')}
						</p>
						<div class="grid gap-2 sm:grid-cols-2">
							<label class="block text-sm">
								<span class="text-gray-600">{t('ui.date')}</span>
								<select class="select mt-1 w-full" bind:value={mapping.date}>
									{#each headers as h (h)}<option value={h}>{h}</option>{/each}
								</select>
							</label>
							<label class="block text-sm">
								<span class="text-gray-600">{t('ui.description')}</span>
								<select class="select mt-1 w-full" bind:value={mapping.description}>
									{#each headers as h (h)}<option value={h}>{h}</option>{/each}
								</select>
							</label>
							<label class="block text-sm">
								<span class="text-gray-600">{t('ui.amount')}</span>
								<select
									class="select mt-1 w-full"
									value={mapping.amount ?? ''}
									onchange={(e) => nameColumn('amount', e.currentTarget.value)}
								>
									<option value="">{t('finance.ledgers.twoColumnsInstead')}</option>
									{#each headers as h (h)}<option value={h}>{h}</option>{/each}
								</select>
							</label>
							{#if !mapping.amount}
								<label class="block text-sm">
									<span class="text-gray-600">{t('finance.ledgers.moneyIn')}</span>
									<select
										class="select mt-1 w-full"
										value={mapping.moneyIn ?? ''}
										onchange={(e) => nameColumn('moneyIn', e.currentTarget.value)}
									>
										<option value="">{t('finance.ledgers.none')}</option>
										{#each headers as h (h)}<option value={h}>{h}</option>{/each}
									</select>
								</label>
								<label class="block text-sm">
									<span class="text-gray-600">{t('finance.ledgers.moneyOut')}</span>
									<select
										class="select mt-1 w-full"
										value={mapping.moneyOut ?? ''}
										onchange={(e) => nameColumn('moneyOut', e.currentTarget.value)}
									>
										<option value="">{t('finance.ledgers.none')}</option>
										{#each headers as h (h)}<option value={h}>{h}</option>{/each}
									</select>
								</label>
							{/if}
							<label class="block text-sm">
								<span class="text-gray-600">{t('finance.ledgers.theBankSOwnId')}</span>
								<select
									class="select mt-1 w-full"
									value={mapping.id ?? ''}
									onchange={(e) => nameColumn('id', e.currentTarget.value)}
								>
									<option value="">{t('finance.ledgers.none')}</option>
									{#each headers as h (h)}<option value={h}>{h}</option>{/each}
								</select>
							</label>
						</div>
						<!--
							The id has to be visible, because getting it wrong loses lines.
							
							A movement carrying the bank's own reference is matched on that
							reference, so a column wrongly taken for one makes two real
							movements look like the same movement and the second is dropped
							as already imported. It is guessed conservatively — named like
							an id and holding something that could be one — and it is here
							so that the guess can be seen and undone.
						-->
						<p class="text-xs text-gray-500">
							{t('finance.ledgers.leaveTheIdAsNone')}
						</p>
						<label class="flex items-center gap-2 text-sm text-gray-700">
							<input type="checkbox" bind:checked={mapping.dayFirst} />
							{t('finance.ledgers.datesAreDayFirst')}
						</label>
						<input type="hidden" name="mapping" value={JSON.stringify(mapping)} />
					</div>
				{/if}
				<label class="flex items-center gap-2 text-sm text-gray-700">
					<input type="checkbox" name="flip" />
					{t('finance.ledgers.flipAmountsForAn')}
				</label>
				<div class="flex flex-wrap items-center gap-2">
					<label class="btn btn-sm cursor-pointer">
						<Icon name="plus" />
						{t('finance.ledgers.chooseTheFile')}
						<input
							type="file"
							accept=".csv,text/csv,text/plain"
							class="hidden"
							onchange={fileChosen}
						/>
					</label>
					<span class="text-xs text-gray-500">{t('finance.ledgers.orPasteItBelow')}</span>
				</div>
				<textarea
					name="text"
					bind:value={statementText}
					rows="7"
					class="input w-full font-mono text-xs"
					placeholder={t('finance.ledgers.dataValorIdentificadorDescrição')}
				></textarea>
				<div>
					<button class="btn btn-primary btn-sm" type="submit">{t('finance.ledgers.import')}</button
					>
					{#if form && 'added' in form && form.success}
						<span class="ml-2 text-sm text-gray-600"
							>{t('finance.ledgers.addedAlreadyHere', {
								added: form.added ?? 0,
								skipped: form.skipped ?? 0
							})}</span
						>
					{/if}
				</div>
			</div>
		</form>
	{/if}
	{#snippet footer()}
		<button class="btn" type="button" onclick={() => (showImport = false)}>{t('ui.done')}</button>
	{/snippet}
</Modal>

<!-- A line by hand. -->
<Modal
	bind:open={showNewMovement}
	error={form?.message}
	title={t('finance.ledgers.newLine')}
	size="sm"
>
	{#if data.current}
		<form
			id="movement-form"
			method="post"
			action="?/addMovement"
			use:enhance={() =>
				({ result, update }) => {
					if (result.type === 'success') showNewMovement = false;
					return update({ reset: result.type === 'success' });
				}}
		>
			<input type="hidden" name="ledgerId" value={data.current.id} />
			<div class="grid gap-3 sm:grid-cols-2">
				<label class="block text-sm sm:col-span-2">
					<span class="text-gray-600">{t('ui.description')}</span>
					<OneLine
						name="heading"
						placeholder={t('finance.ledgers.coffee')}
						class="input mt-1 w-full"
						required
						autofocus
					/>
				</label>
				<label class="block text-sm">
					<span class="text-gray-600">{t('finance.ledgers.day')}</span>
					<input type="date" name="occurredOn" value={today} class="input mt-1 w-full" required />
				</label>
				<label class="block text-sm">
					<span class="text-gray-600">{t('ui.amount')}</span>
					<input name="amount" inputmode="decimal" placeholder="0,00" class="input mt-1 w-full" />
				</label>
				<label class="block text-sm sm:col-span-2">
					<span class="text-gray-600">{t('finance.ledgers.direction')}</span>
					<select name="direction" class="select mt-1 w-full">
						<option value="out">{t('finance.ledgers.moneyOut')}</option>
						<option value="in">{t('finance.ledgers.moneyIn')}</option>
					</select>
				</label>
			</div>
		</form>
	{/if}
	{#snippet footer()}
		<button class="btn" type="button" onclick={() => (showNewMovement = false)}
			>{t('ui.cancel')}</button
		>
		<button class="btn btn-primary" type="submit" form="movement-form">{t('ui.add')}</button>
	{/snippet}
</Modal>

<!-- Correct a line. -->
<Modal
	open={editing !== null}
	error={form?.message}
	title={t('finance.ledgers.editLine')}
	onclose={() => (editingId = null)}
	size="sm"
>
	{#if editing}
		<form
			id="movement-edit"
			method="post"
			action="?/updateMovement"
			use:enhance={() =>
				({ result, update }) => {
					if (result.type === 'success') editingId = null;
					return update();
				}}
		>
			<input type="hidden" name="id" value={editing.id} />
			<div class="grid gap-3 sm:grid-cols-2">
				<label class="block text-sm sm:col-span-2">
					<span class="text-gray-600">{t('ui.description')}</span>
					<OneLine name="heading" value={editing.description} class="input mt-1 w-full" required />
					<span class="mt-1 block text-xs text-gray-500">
						{t('finance.ledgers.theRulesReadThisSo')}
					</span>
				</label>
				<label class="block text-sm">
					<span class="text-gray-600">{t('finance.ledgers.day')}</span>
					<input
						type="date"
						name="occurredOn"
						value={editing.occurredOn}
						class="input mt-1 w-full"
					/>
				</label>
				<label class="block text-sm">
					<span class="text-gray-600">{t('ui.amount')}</span>
					<input
						name="amount"
						inputmode="decimal"
						value={asDecimal(editing.amountCents)}
						class="input mt-1 w-full"
					/>
				</label>
				<label class="block text-sm">
					<span class="text-gray-600">{t('finance.ledgers.direction')}</span>
					<select
						name="direction"
						class="select mt-1 w-full"
						value={editing.amountCents >= 0 ? 'in' : 'out'}
					>
						<option value="out">{t('finance.ledgers.moneyOut')}</option>
						<option value="in">{t('finance.ledgers.moneyIn')}</option>
					</select>
				</label>
				<label class="block text-sm">
					<span class="text-gray-600">{t('finance.ledgers.ledger')}</span>
					<select name="ledgerId" class="select mt-1 w-full" value={editing.ledgerId ?? ''}>
						{#each data.ledgers as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
					</select>
				</label>
			</div>
		</form>
	{/if}
	{#snippet footer()}
		<button class="btn" type="button" onclick={() => (editingId = null)}>{t('ui.cancel')}</button>
		<button class="btn btn-primary" type="submit" form="movement-edit">{t('ui.save')}</button>
	{/snippet}
</Modal>

<!-- Delete a line. -->
<Modal
	open={deletingMovement !== null}
	title={t('finance.ledgers.deleteThisLine2')}
	onclose={() => (deletingMovement = null)}
	size="sm"
>
	{#if deletingMovement}
		<p class="text-sm text-gray-600">
			<strong>{deletingMovement.description}</strong>
			{t('finance.ledgers.goesImportingTheSameStatement')}
		</p>
	{/if}
	{#snippet footer()}
		<button class="btn" type="button" onclick={() => (deletingMovement = null)}
			>{t('finance.ledgers.keepIt')}</button
		>
		<form
			method="post"
			action="?/deleteMovement"
			use:enhance={() =>
				({ result, update }) => {
					if (result.type === 'success') deletingMovement = null;
					return update();
				}}
		>
			<input type="hidden" name="id" value={deletingMovement?.id} />
			<button class="btn btn-danger" type="submit" use:armed>{t('ui.delete')}</button>
		</form>
	{/snippet}
</Modal>

<style>
	/*
	 * A washed line is one band, not a row of tiles.
	 *
	 * The category colour is set on the row, and a browser paints a row's
	 * background cell by cell — so every corner the playful style rounds cuts a
	 * notch out of the colour, and a categorised line came out as five rounded
	 * blocks with the page showing through between them. The row is what carries
	 * the colour, so the cells inside it have no corners of their own.
	 */
	.statement :is(td, th) {
		border-radius: 0;
	}
</style>
