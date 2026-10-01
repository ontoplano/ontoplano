<script lang="ts">
	import { routeGlyph } from '$lib/glyphs';
	import Picker from '$lib/components/Picker.svelte';
	import { civilOf, dayOf as dayOfWhen, dayStamp, monthOf } from '$lib/when';
	import { useWhen } from '$lib/when-context.svelte';
	import { enhance } from '$lib/enhance';
	import TagChip from '$lib/components/TagChip.svelte';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import ShowingCount from '$lib/components/ShowingCount.svelte';
	import SearchField from '$lib/components/SearchField.svelte';
	import SortControl from '$lib/components/SortControl.svelte';
	import StripVerb from '$lib/components/StripVerb.svelte';
	import TabStrip from '$lib/components/TabStrip.svelte';
	import CategoryMark from '$lib/components/CategoryMark.svelte';
	import RoomToolbar from '$lib/components/RoomToolbar.svelte';
	import { setRoomAction } from '$lib/room-action.svelte';
	import { browsable } from '$lib/browse.svelte';
	import { listCursor } from '$lib/actions/list-cursor';
	import { getAction, keyFor } from '$lib/shortcuts';
	import { CSV_PARSER_KEY, sniffCsv, type CsvMapping } from '$lib/bank-parsers';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import LedgerFields from '$lib/components/fields/LedgerFields.svelte';
	import { LEDGER_KIND_LABELS } from '$lib/services/ledgers';
	import Modal from '$lib/components/Modal.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import { armed } from '$lib/actions/armed';
	import { formatMoney, type Currency } from '$lib/money';
	import type { PlainKey } from '$lib/i18n/keys';
	import type { PageServerData, ActionData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();
	const now = useWhen();

	/** Where this screen's keys are registered — `$lib/shortcuts`. */
	const ROOM = '/finance/ledgers';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	const currency = $derived(data.currency as Currency);

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
	/** The dialog that holds everything done to a ledger rather than to a line. */
	let managing = $state(false);

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

	/** The ledger's own default, or the generic reader. */
	function openImport() {
		source = data.current?.defaultParser || CSV_PARSER_KEY;
		showImport = true;
	}

	/** The filters ride the URL, so a view can be kept open or shared. */
	function filter(changes: { ledger?: number; q?: string; month?: string; loose?: boolean }) {
		const params: [string, string][] = [];
		const ledger = changes.ledger ?? data.current?.id;
		const q = changes.q ?? data.query;
		const month = changes.month ?? data.month;
		const loose = changes.loose ?? data.loose;
		if (ledger) params.push(['ledger', String(ledger)]);
		if (q) params.push(['q', String(q)]);
		if (month) params.push(['month', String(month)]);
		if (loose) params.push(['uncategorized', '1']);
		cursor = -1;
		// The path is resolved; the rule cannot see through the appended query.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(`${resolve('/finance/ledgers')}?${new URLSearchParams(params)}`, {
			noScroll: true,
			keepFocus: true
		});
	}

	/** Whether this ledger has lines no category claims, so the toggle is offered. */
	const hasLoose = $derived(data.unsorted > 0 || data.loose);
	const narrowed = $derived(Boolean(data.query || data.month || data.loose));
	const clearFilters = () => filter({ q: '', month: '', loose: false });

	/*
	 * The order the lines are read in.
	 *
	 * A statement is newest first, and that stays the default; by amount is
	 * "what were the big ones", by description groups one shop's lines.
	 */
	const ORDERS = ['day', 'amount', 'description'] as const;
	type Order = (typeof ORDERS)[number];
	const ORDER_LABELS: Record<Order, PlainKey> = {
		day: 'finance.ledgers.day',
		amount: 'ui.amount',
		description: 'ui.description'
	};
	let order = $state<Order>('day');
	let direction = $state<'asc' | 'desc'>('desc');

	const lines = $derived.by(() => {
		const sign = direction === 'asc' ? 1 : -1;
		const by: Record<Order, (a: Movement, b: Movement) => number> = {
			day: (a, b) => a.occurredOn.localeCompare(b.occurredOn) || a.id - b.id,
			amount: (a, b) => a.amountCents - b.amountCents,
			description: (a, b) => a.description.localeCompare(b.description)
		};
		return [...data.movements].sort((a, b) => sign * by[order](a, b));
	});

	/* A row's day the app's one way: `Sep 12`. The band above says the year. */
	const dayOf = (iso: string) => dayOfWhen(iso, now());

	/*
	 * Which rows start a year.
	 *
	 * A row says its day and month and nothing says which year — fine until
	 * the list crosses new year's, where Dec 31 sits above Jan 1
	 * and they are twelve months apart. A band across the list says which
	 * year the rows under it belong to, the way a bank statement does. Only
	 * while the lines run by day: in any other order a band would split one
	 * year into dozens.
	 */
	const yearBands = $derived(
		order !== 'day'
			? new Map<number, string>()
			: new Map(
					lines
						.map((m, i) => [
							m.id,
							i === 0 || m.occurredOn.slice(0, 4) !== lines[i - 1].occurredOn.slice(0, 4)
								? m.occurredOn.slice(0, 4)
								: null
						])
						.filter((entry): entry is [number, string] => entry[1] !== null)
				)
	);
	const asDecimal = (cents: number) => (Math.abs(cents) / 100).toFixed(2);
	// The reader's own day: `toISOString` is UTC, which is tomorrow for the
	// last hours of every evening in São Paulo.
	const today = $derived(dayStamp(new Date(), now()));

	/*
	 * This screen's one verb, drawn by the room's bar — see $lib/room-action.
	 *
	 * Writing a line is what a ledger is opened for most days; making another
	 * ledger happens a handful of times ever, and lives with the ledgers.
	 */
	setRoomAction(() =>
		data.current
			? {
					label: t('finance.ledgers.newLine'),
					run: () => (showNewMovement = true),
					kbd: keyFor(ROOM, 'new')
				}
			: { label: t('finance.ledgers.newLedger'), run: () => (showNewLedger = true) }
	);

	/* j/k down the lines, h/l across the ledgers, e to correct one. */
	let cursor = $state(-1);
	browsable(() => ({
		items: () => lines,
		cursor: () => cursor,
		moveTo: (i) => (cursor = i),
		tabs: {
			of: active.map((l) => String(l.id)),
			current: () => String(data.current?.id ?? ''),
			go: (id) => filter({ ledger: Number(id), q: '', month: '', loose: false })
		},
		open: (i) => (editingId = lines[i].id),
		edit: (i) => (editingId = lines[i].id)
	}));

	function onkeydown(event: KeyboardEvent) {
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		const target = event.target;
		if (
			document.querySelector('dialog[open]') ||
			target instanceof HTMLInputElement ||
			target instanceof HTMLTextAreaElement ||
			target instanceof HTMLSelectElement ||
			(target instanceof HTMLElement && target.isContentEditable)
		)
			return;
		if (!data.current) return;
		const action = getAction(ROOM, event.key);
		if (action === 'new') {
			event.preventDefault();
			showNewMovement = true;
		} else if (action === 'import') {
			event.preventDefault();
			openImport();
		} else if (action === 'delete' && cursor >= 0 && cursor < lines.length) {
			// Arms the confirmation; it never deletes on its own.
			event.preventDefault();
			deletingMovement = lines[cursor];
		}
	}

	/** The strip: each ledger with its balance, the way the tiles had it. */
	const ledgerTabs = $derived(
		active.map((l) => ({
			label: l.name,
			count: money(l.balanceCents)
		}))
	);
</script>

{#snippet monthPicker()}
	<!--
		The months this ledger has, not a date field.

		`input type="month"` is a picker in Chromium and a bare text box
		in Firefox, where typing "2" filters to nothing and the box
		explains nothing. A list of the months there is something to
		look at is native everywhere, and shorter.
	-->
	<Picker
		value={data.month ?? ''}
		options={[
			{ value: '', label: t('finance.ledgers.everyMonth') },
			...data.months.map((m) => ({ value: m, label: monthName(m) }))
		]}
		onpick={(next) => filter({ month: next })}
		label={t('finance.ledgers.month')}
	/>
{/snippet}

<!--
	With the uncategorized toggle there are two filters, and a phone's strip has
	no room for both beside the search box, so they fold into the sheet; the
	month alone stays out.
-->
{#snippet bothFilters()}
	{@render monthPicker()}
	<!-- The lines no category claims, as a narrowing of this list: the Rules tab
	     is where they get one. Same label pressed or not. -->
	<button
		type="button"
		class="btn btn-sm shrink-0"
		aria-pressed={data.loose}
		onclick={() => filter({ loose: !data.loose })}
	>
		{t('finance.ledgers.uncategorizedCount', { count: data.unsorted })}
	</button>
{/snippet}

<svelte:window {onkeydown} />

<FormError message={form?.message} />

{#if active.length === 0 && archived.length === 0}
	<RoomSurface>
		<EmptyState
			icon={routeGlyph('/finance/ledgers')!}
			title={t('finance.ledgers.noLedgersYet')}
			description={t('finance.ledgers.aLedgerIsOnePlace')}
		/>
	</RoomSurface>
{:else}
	<!--
		One surface, top to bottom: which ledger (a strip of them, the way a
		room's tabs are, each with its balance), what narrows its lines, and
		the lines themselves. What is done to a ledger rather than to a line —
		rename it, move it along, put it away — is in the Ledgers dialog at the
		end of the strip; importing its statement sits beside it.
	-->
	<RoomSurface>
		<div class="ledger-strip">
			<TabStrip
				nested
				label={t('rooms.finance.tabs.ledgers')}
				tabs={ledgerTabs}
				current={active.findIndex((l) => l.id === data.current?.id)}
				onpick={(i) => filter({ ledger: active[i].id, q: '', month: '', loose: false })}
			>
				{#snippet trailing()}
					<div class="ml-auto flex shrink-0 items-center gap-2">
						{#if data.current}
							<StripVerb icon="download" label={t('finance.ledgers.import')} onclick={openImport} />
						{/if}
						<StripVerb
							icon="bank"
							label={t('rooms.finance.tabs.ledgers')}
							onclick={() => (managing = true)}
						/>
					</div>
				{/snippet}
			</TabStrip>
		</div>

		{#if !data.current}
			<EmptyState
				icon={routeGlyph('/finance/ledgers')!}
				title={t('finance.ledgers.noLedgersYet')}
				description={t('finance.ledgers.aLedgerIsOnePlace')}
			/>
		{:else}
			{@const current = data.current}
			<!-- Finding one line among a year of them. -->
			<RoomToolbar inset>
				{#snippet tools()}
					<FilterBar
						name="movements"
						on={narrowed}
						summary={[
							data.query,
							data.month ? monthName(data.month) : '',
							data.loose ? t('finance.ledgers.uncategorizedCount', { count: data.unsorted }) : ''
						]
							.filter(Boolean)
							.join(', ')}
						onclear={clearFilters}
						inline={hasLoose ? undefined : monthPicker}
						children={hasLoose ? bothFilters : undefined}
					>
						{#snippet lead()}
							<SearchField
								value={data.query}
								label={t('finance.ledgers.searchDescriptions')}
								oninput={(e) => filter({ q: (e.currentTarget as HTMLInputElement).value })}
							/>
						{/snippet}
						{#snippet count()}
							<ShowingCount
								total={current.count}
								shown={data.movements.length}
								said={(count) => t('finance.ledgers.showingCount', { count })}
							/>
						{/snippet}

						{#snippet trailing()}
							<SortControl
								value={order}
								options={ORDERS}
								labels={ORDER_LABELS}
								{direction}
								onpick={(next) => {
									order = next;
									cursor = -1;
								}}
								onflip={() => {
									direction = direction === 'asc' ? 'desc' : 'asc';
									cursor = -1;
								}}
								label={t('finance.ledgers.orderLinesBy')}
							/>
						{/snippet}
					</FilterBar>
				{/snippet}
			</RoomToolbar>

			{#if lines.length === 0}
				{#if narrowed}
					<EmptyState
						filtered
						onclear={clearFilters}
						description={t('finance.ledgers.noLinesMatch')}
					/>
				{:else}
					<EmptyState
						icon={routeGlyph('/finance/ledgers')!}
						title={t('finance.ledgers.nothingHereYet')}
						description={t('finance.ledgers.importThisLedgerSExportOr')}
					/>
				{/if}
			{:else}
				<!--
					A statement is a table on a desktop and a list on a phone.

					Six columns across 390px squeezed the amount off the right and
					stood the tag chips on their heads. The same rows, laid out twice:
					below `sm` a block per movement, the description and the amount on
					the first line and the day and everything that sorts it on the
					second. Neither scrolls inside itself — the page does.
				-->
				<ul class="divide-y divide-gray-200 sm:hidden">
					{#each lines as m, i (m.id)}
						{#if yearBands.has(m.id)}
							<li class="year-band">{yearBands.get(m.id)}</li>
						{/if}
						<li class="px-4 py-2.5" data-row use:listCursor={i === cursor}>
							<div class="flex items-start gap-3">
								<span class="line-clamp-2 min-w-0 flex-1 text-sm text-gray-900">
									{m.description}
								</span>
								<span
									class="tabular shrink-0 text-sm {m.amountCents >= 0
										? 'text-blue-700'
										: 'text-gray-900'}"
								>
									{money(m.amountCents)}
								</span>
							</div>
							<div class="mt-1 flex items-center gap-2">
								<span class="tabular shrink-0 text-xs text-gray-500">{dayOf(m.occurredOn)}</span>
								<span class="flex min-w-0 flex-1 flex-wrap items-center gap-1">
									{#if m.category}
										<CategoryMark name={m.category} color={m.categoryColor} />
									{/if}
									{#each m.tags as tag (tag.name)}
										<TagChip name={tag.name} color={tag.color} />
									{/each}
								</span>
								<span class="row-actions inline-flex shrink-0 items-center gap-1">
									<button
										class="icon-btn"
										title={t('finance.ledgers.editThisLine')}
										aria-label={t('finance.ledgers.editThisLine')}
										onclick={() => (editingId = m.id)}
									>
										<Icon name="edit" />
									</button>
									<button
										class="icon-btn icon-btn-danger"
										title={t('finance.ledgers.deleteThisLine')}
										aria-label={t('finance.ledgers.deleteThisLine')}
										onclick={() => (deletingMovement = m)}
									>
										<Icon name="trash" />
									</button>
								</span>
							</div>
						</li>
					{/each}
				</ul>

				<table class="statement hidden w-full text-sm sm:table">
					<thead>
						<tr class="border-b border-gray-200 text-left text-xs text-gray-500">
							<th class="py-2 font-medium">{t('finance.ledgers.day')}</th>
							<th class="py-2 font-medium">{t('ui.description')}</th>
							<th class="py-2 font-medium">{t('ui.category')}</th>
							<th class="py-2 font-medium">{t('ui.tags')}</th>
							<th class="py-2 text-right font-medium">{t('ui.amount')}</th>
							<th class="py-2"><span class="sr-only">{t('ui.actions')}</span></th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200">
						{#each lines as m, i (m.id)}
							{#if yearBands.has(m.id)}
								<tr><td colspan="6" class="year-band">{yearBands.get(m.id)}</td></tr>
							{/if}
							<tr data-row use:listCursor={i === cursor}>
								<td class="tabular py-2 whitespace-nowrap text-gray-500">
									{dayOf(m.occurredOn)}
								</td>
								<td class="py-2 text-gray-900">{m.description}</td>
								<td class="py-2 whitespace-nowrap">
									{#if m.category}
										<CategoryMark name={m.category} color={m.categoryColor} />
									{:else}
										<span class="text-xs text-gray-500">—</span>
									{/if}
								</td>
								<td class="py-2">
									<span class="flex flex-wrap gap-1">
										{#each m.tags as tag (tag.name)}
											<TagChip name={tag.name} color={tag.color} />
										{/each}
									</span>
								</td>
								<td
									class="tabular py-2 text-right whitespace-nowrap {m.amountCents >= 0
										? 'text-blue-700'
										: 'text-gray-900'}"
								>
									{money(m.amountCents)}
								</td>
								<td class="py-2 text-right whitespace-nowrap">
									<span class="row-actions inline-flex shrink-0 items-center gap-1">
										<button
											class="icon-btn"
											title={t('finance.ledgers.editThisLine')}
											aria-label={t('finance.ledgers.editThisLine')}
											onclick={() => (editingId = m.id)}
										>
											<Icon name="edit" />
										</button>
										<button
											class="icon-btn icon-btn-danger"
											title={t('finance.ledgers.deleteThisLine')}
											aria-label={t('finance.ledgers.deleteThisLine')}
											onclick={() => (deletingMovement = m)}
										>
											<Icon name="trash" />
										</button>
									</span>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		{/if}
	</RoomSurface>
{/if}

<!--
	The ledgers themselves: what each is, in the order the strip shows them,
	and what can be done to one. A list rather than arrows on the strip —
	arrows beside a statement read as paging through it.
-->
<Modal bind:open={managing} title={t('rooms.finance.tabs.ledgers')} size="sm">
	<ul class="-mx-4 -my-4 divide-y divide-gray-200 border-y border-gray-200 sm:-mx-5">
		{#each [...active, ...archived] as ledger, index (ledger.id)}
			<li class="list-row">
				<span class="list-row-main min-w-0">
					<span
						class="block truncate text-sm font-medium {ledger.archived
							? 'text-gray-600'
							: 'text-gray-900'}">{ledger.name}</span
					>
					<span class="block text-xs text-gray-500">
						{[
							t(LEDGER_KIND_LABELS[ledger.kind]),
							t('finance.ledgers.lines', { count: ledger.count }),
							money(ledger.balanceCents),
							ledger.lastOn
								? t('finance.ledgers.lastOn', { day: civilOf(ledger.lastOn, now()) })
								: ''
						]
							.filter(Boolean)
							.join(' · ')}
					</span>
				</span>
				<span class="list-row-actions">
					{#if !ledger.archived}
						<form method="post" action="?/moveLedger" use:enhance>
							<input type="hidden" name="id" value={ledger.id} />
							<input type="hidden" name="delta" value="-1" />
							<button
								class="icon-btn"
								disabled={index === 0}
								title={t('finance.ledgers.moveEarlier', { name: ledger.name })}
								aria-label={t('finance.ledgers.moveEarlier', { name: ledger.name })}
							>
								<Icon name="chevron-up" />
							</button>
						</form>
						<form method="post" action="?/moveLedger" use:enhance>
							<input type="hidden" name="id" value={ledger.id} />
							<input type="hidden" name="delta" value="1" />
							<button
								class="icon-btn"
								disabled={index === active.length - 1}
								title={t('finance.ledgers.moveLater', { name: ledger.name })}
								aria-label={t('finance.ledgers.moveLater', { name: ledger.name })}
							>
								<Icon name="chevron-down" />
							</button>
						</form>
					{/if}
					<button
						class="icon-btn"
						title={t('ui.edit')}
						aria-label={t('finance.ledgers.edit', { name: ledger.name })}
						onclick={() => {
							managing = false;
							editingLedger = ledger;
						}}
					>
						<Icon name="edit" />
					</button>
					<form data-leaves method="post" action="?/archiveLedger" use:enhance>
						<input type="hidden" name="id" value={ledger.id} />
						<input type="hidden" name="archived" value={ledger.archived ? 'false' : 'true'} />
						{#if ledger.archived}
							<button
								class="icon-btn"
								title={t('finance.ledgers.restore')}
								aria-label={t('finance.ledgers.restore')}
							>
								<Icon name="undo" />
							</button>
						{:else}
							<button
								class="icon-btn"
								title={t('finance.ledgers.putItAway')}
								aria-label={t('finance.ledgers.archive', { name: ledger.name })}
							>
								<Icon name="archive" />
							</button>
						{/if}
					</form>
					<!-- Deleting takes the history with it, so only a put-away ledger offers it. -->
					{#if ledger.archived}
						<button
							class="icon-btn icon-btn-danger"
							title={t('ui.delete')}
							aria-label={t('finance.ledgers.delete', { name: ledger.name })}
							onclick={() => {
								managing = false;
								deletingLedger = ledger;
							}}
						>
							<Icon name="trash" />
						</button>
					{/if}
				</span>
			</li>
		{/each}
	</ul>
	{#snippet footer()}
		<button
			class="btn"
			type="button"
			onclick={() => {
				managing = false;
				showNewLedger = true;
			}}
		>
			<Icon name="plus" />
			{t('finance.ledgers.newLedger')}
		</button>
		<button class="btn btn-primary" type="button" onclick={() => (managing = false)}
			>{t('ui.done')}</button
		>
	{/snippet}
</Modal>

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
		<LedgerFields parsers={data.parsers} notebooks={data.notebooks} />
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
			<LedgerFields editing={editingLedger} parsers={data.parsers} notebooks={data.notebooks} />
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
					placeholder={t('finance.ledgers.pasteExample')}
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
	 * A line is one band, not a row of tiles: a browser paints a row's
	 * background cell by cell, so a hovered or selected line came out as
	 * rounded blocks with the page showing through where the playful style
	 * rounded each cell. The row carries it; the cells have no corners.
	 */
	.statement :is(td, th) {
		border-radius: 0;
		padding-inline: 0.75rem;
	}

	/* The table's edges on the surface's own gutter, like every row's. */
	.statement :is(td, th):first-child {
		padding-inline-start: var(--row-pad-x);
	}

	.statement :is(td, th):last-child {
		padding-inline-end: var(--row-pad-x);
	}

	/* The strip's rule runs the surface's full width, like the toolbar's under it. */
	.ledger-strip {
		padding-inline: var(--row-pad-x);
		border-bottom: 1px solid var(--color-gray-200);
	}

	.ledger-strip :global(.room-tabs-nested) {
		border-bottom: 0;
	}

	/* Which year the rows under it belong to, the way a bank statement says. */
	.year-band {
		background-color: var(--color-gray-50);
		padding: 0.25rem 1rem;
		text-align: center;
		font-size: 0.75rem;
		font-weight: 500;
		letter-spacing: 0.1em;
		color: var(--color-gray-500);
		font-variant-numeric: tabular-nums;
	}
</style>
