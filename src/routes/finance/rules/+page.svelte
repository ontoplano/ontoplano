<script lang="ts">
	import { useWhen } from '$lib/when-context.svelte';
	import { civilOf } from '$lib/when';
	import { enhance } from '$lib/enhance';
	import CategoryMark from '$lib/components/CategoryMark.svelte';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import SearchField from '$lib/components/SearchField.svelte';
	import ShowingCount from '$lib/components/ShowingCount.svelte';
	import { setRoomAction } from '$lib/room-action.svelte';
	import { browsable, typing } from '$lib/browse.svelte';
	import { listCursor } from '$lib/actions/list-cursor';
	import { getAction } from '$lib/shortcuts';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Card from '$lib/components/Card.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import { armed } from '$lib/actions/armed';
	import { formatMoney, type Currency } from '$lib/money';
	import type { PageServerData, ActionData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();
	const now = useWhen();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	const ROOM = '/finance/rules';
	/** What `showing` says for the lines no category claims. */
	const UNSORTED = 'none';
	/** The panel of lines behind a count. */
	const LINES_ID = 'rule-lines';

	const currency = $derived(data.currency as Currency);
	type Rule = PageServerData['rules'][number];

	/** Finding a rule by its name or by what its pattern says. */
	let looking = $state('');
	const needle = $derived(looking.trim().toLowerCase());
	const matching = $derived(
		needle === ''
			? data.rules
			: data.rules.filter(
					(r) => r.name.toLowerCase().includes(needle) || r.pattern.toLowerCase().includes(needle)
				)
	);
	const categories = $derived(matching.filter((r) => r.kind === 'category'));
	const tags = $derived(matching.filter((r) => r.kind === 'tag'));
	/** The two panes: categories partition, tags overlap. */
	const groups = $derived([
		{
			kind: 'category' as const,
			title: t('finance.rules.categories'),
			blurb: t('finance.rules.aLineBelongsToThe'),
			rules: categories,
			offset: 0,
			tour: 'rule-categories'
		},
		{
			kind: 'tag' as const,
			title: t('finance.rules.tags'),
			blurb: t('finance.rules.everyTagThatMatchesApplies'),
			rules: tags,
			offset: categories.length,
			tour: 'rule-tags'
		}
	]);
	/** Every row on screen, top to bottom, for j and k. */
	const walked = $derived([...categories, ...tags]);

	/** The rule being edited, or the kind of the one being written. */
	let editingId: number | null = $state(null);
	const editing = $derived(data.rules.find((r) => r.id === editingId) ?? null);
	let creating: Rule['kind'] | null = $state(null);
	/** Bumped per opening, so the fields mount fresh rather than keeping the last rule. */
	let formKey = $state(0);
	let deleting: Rule | null = $state(null);

	function openNew(kind: Rule['kind']) {
		editingId = null;
		creating = kind;
		formKey++;
	}

	function openEdit(id: number) {
		creating = null;
		editingId = id;
		formKey++;
	}

	function closeForm() {
		creating = null;
		editingId = null;
	}

	/* This screen's one verb, drawn by the room's bar — see $lib/room-action. */
	setRoomAction(() => ({
		label: t('finance.rules.newRule'),
		run: () => openNew('category'),
		kbd: 'n'
	}));

	function show(showing: string) {
		const params = showing ? `?${new URLSearchParams({ showing })}` : '';
		// The path is resolved; the rule cannot see through the appended query.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(`${resolve('/finance/rules')}${params}`, { noScroll: true }).then(() => {
			// The lines open under every rule, which on a long list is below the
			// fold: bring them up, or the press looks like it did nothing.
			if (showing) document.getElementById(LINES_ID)?.scrollIntoView({ block: 'start' });
		});
	}

	let cursor = $state(-1);
	browsable(() => ({
		items: () => walked,
		cursor: () => cursor,
		moveTo: (i) => (cursor = i),
		open: (i) => show(data.showing === String(walked[i].id) ? '' : String(walked[i].id)),
		edit: (i) => openEdit(walked[i].id)
	}));

	function onkeydown(event: KeyboardEvent) {
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		if (typing(event)) return;
		const action = getAction(ROOM, event);
		if (action === 'new') {
			event.preventDefault();
			openNew('category');
		} else if (action === 'delete' && cursor >= 0 && cursor < walked.length) {
			// Arms the confirmation; it never deletes on its own.
			event.preventDefault();
			deleting = walked[cursor];
		}
	}
</script>

<svelte:window {onkeydown} />

<!--
	One surface: finding a rule along its top, then the rules as two panes of
	the same object, one above the other — categories partition, tags overlap
	— and under them the lines behind whichever count was pressed.
-->
<RoomSurface>
	{#snippet tools()}
		<FilterBar
			name="rules"
			on={needle !== '' || data.showing === UNSORTED}
			summary={[
				looking.trim(),
				data.showing === UNSORTED
					? t('finance.ledgers.uncategorizedCount', { count: data.unsorted })
					: ''
			]
				.filter(Boolean)
				.join(', ')}
			onclear={() => {
				looking = '';
				if (data.showing === UNSORTED) show('');
			}}
		>
			{#snippet lead()}
				<SearchField bind:value={looking} label={t('finance.rules.searchRules')} />
			{/snippet}
			{#snippet count()}
				<ShowingCount
					total={data.rules.length}
					shown={matching.length}
					said={(count) => t('finance.rules.showingCount', { count })}
				/>
			{/snippet}
			{#snippet inline()}
				<!-- The lines no category claims, the way Ledgers narrows to them: the
				     same words, pressed or not. They open under the rules. -->
				<button
					type="button"
					class="btn btn-sm shrink-0"
					aria-pressed={data.showing === UNSORTED}
					hidden={data.unsorted === 0 && data.showing !== UNSORTED}
					onclick={() => show(data.showing === UNSORTED ? '' : UNSORTED)}
				>
					{t('finance.ledgers.uncategorizedCount', { count: data.unsorted })}
				</button>
			{/snippet}
		</FilterBar>
	{/snippet}

	<FormError message={form?.message} />

	{#each groups as group, g (group.kind)}
		<Card
			title={group.title}
			description={group.blurb}
			flush
			pane
			dataTour={group.tour}
			class={g > 0 ? 'border-t border-gray-200' : ''}
		>
			{#snippet actions()}
				<button
					type="button"
					class="icon-btn"
					title={group.kind === 'category'
						? t('finance.rules.newCategory')
						: t('finance.rules.newTag')}
					aria-label={group.kind === 'category'
						? t('finance.rules.newCategory')
						: t('finance.rules.newTag')}
					onclick={() => openNew(group.kind)}
				>
					<Icon name="plus" />
				</button>
			{/snippet}
			{#if group.rules.length === 0}
				{#if needle !== ''}
					<EmptyState compact filtered onclear={() => (looking = '')} />
				{:else}
					<EmptyState compact icon="sort" title={t('finance.rules.noneYet')} />
				{/if}
			{:else}
				<ul class="divide-y divide-gray-200">
					{#each group.rules as rule, index (rule.id)}
						<li class="list-row" data-row use:listCursor={group.offset + index === cursor}>
							<!-- The name, then what it looks for: beside it where there is the
							     width, under it on a phone, where a pattern beside a pill and
							     five buttons was cut to eight characters. -->
							<div
								class="list-row-main flex min-w-0 flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2"
							>
								<CategoryMark name={rule.name} color={rule.color} />
								<code
									class="max-w-full min-w-0 text-xs break-all text-gray-600 sm:flex-1 sm:truncate"
									title={rule.pattern}
								>
									/{rule.pattern}/i
								</code>
							</div>
							<div class="list-row-actions">
								{#if rule.problem}
									<!-- Words and a mark, never a colour alone: this is the one
									     thing on the row that needs acting on. -->
									<span
										class="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-gray-900"
										title={rule.problem}
									>
										<Icon name="warning" size={14} />
										{t('finance.rules.notRunning')}
									</span>
								{:else}
									<!--
										The count is the way in.

										"Six lines" is not an answer to "is this pattern right" —
										which six is. Pressing it puts them below the rules, and
										pressing it again puts them away. As tall as the icons
										beside it.
									-->
									<button
										class="btn btn-sm tabular min-h-9 shrink-0"
										title={t('finance.rules.whichLinesThisClaims')}
										data-tour="rule-count"
										aria-pressed={data.showing === String(rule.id)}
										onclick={() => show(data.showing === String(rule.id) ? '' : String(rule.id))}
									>
										{rule.matches}
									</button>
								{/if}
								<form method="post" action="?/move" use:enhance>
									<input type="hidden" name="id" value={rule.id} />
									<input type="hidden" name="delta" value="-1" />
									<button
										class="icon-btn"
										title={t('finance.rules.moveUp', { name: rule.name })}
										aria-label={t('finance.rules.moveUp', { name: rule.name })}
										disabled={index === 0}
									>
										<Icon name="chevron-up" />
									</button>
								</form>
								<form method="post" action="?/move" use:enhance>
									<input type="hidden" name="id" value={rule.id} />
									<input type="hidden" name="delta" value="1" />
									<button
										class="icon-btn"
										title={t('finance.rules.moveDown', { name: rule.name })}
										aria-label={t('finance.rules.moveDown', { name: rule.name })}
										disabled={index === group.rules.length - 1}
									>
										<Icon name="chevron-down" />
									</button>
								</form>
								<button
									class="icon-btn"
									title={t('ui.edit')}
									aria-label={t('finance.rules.edit', { name: rule.name })}
									onclick={() => openEdit(rule.id)}
								>
									<Icon name="edit" />
								</button>
								<button
									class="icon-btn icon-btn-danger"
									title={t('ui.delete')}
									aria-label={t('finance.rules.delete', { name: rule.name })}
									onclick={() => (deleting = rule)}
								>
									<Icon name="trash" />
								</button>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</Card>
	{/each}

	<!--
		The lines behind a number.

		Under the two panes rather than inside one of them: it is the answer
		to a question asked in either, and a panel that appears inside one
		would push the other pane's rows around.
	-->
	{#if data.showing}
		<Card id={LINES_ID} title={data.showingLabel} flush pane class="border-t border-gray-200">
			{#snippet actions()}
				<button
					class="icon-btn"
					title={t('ui.close')}
					aria-label={t('ui.close')}
					onclick={() => show('')}
				>
					<Icon name="close" />
				</button>
			{/snippet}
			{#if data.lines.length === 0}
				<EmptyState compact icon="search" title={t('finance.rules.nothingHere')} />
			{:else}
				<ul class="divide-y divide-gray-200">
					{#each data.lines as line (line.id)}
						<li class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
							<span class="tabular w-24 shrink-0 text-xs text-gray-500"
								>{civilOf(line.occurredOn, now())}</span
							>
							<span class="min-w-0 flex-1 truncate text-sm text-gray-900">{line.description}</span>
							{#if line.category && line.category !== data.showingLabel}
								<!-- The category it did land in, worn the one way. Not on a
								     category's own lines, where it would say the heading again. -->
								<CategoryMark name={line.category} color={line.categoryColor} />
							{/if}
							{#if line.ledgerName}
								<span class="shrink-0 text-xs text-gray-500">{line.ledgerName}</span>
							{/if}
							<span
								class="tabular shrink-0 text-sm {line.amountCents < 0
									? 'text-gray-900'
									: 'text-blue-700'}"
							>
								{formatMoney(line.amountCents, currency)}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</Card>
	{/if}
</RoomSurface>

<!-- New and edit, one form. -->
<Modal
	open={creating !== null || editing !== null}
	error={form?.message}
	title={editing ? t('finance.rules.editRule') : t('finance.rules.newRule')}
	onclose={closeForm}
	size="sm"
>
	{#key formKey}
		<form
			id="rule-form"
			method="post"
			action={editing ? '?/update' : '?/create'}
			use:enhance={() =>
				({ result, update }) => {
					if (result.type === 'success') closeForm();
					return update();
				}}
		>
			{#if editing}<input type="hidden" name="id" value={editing.id} />{/if}
			<FormGrid>
				{#if !editing}
					<Field label={t('finance.rules.kind')} span={12}>
						<!-- One way, not bound: the form is reset after a save while the dialog
						     is still mounted, and a binding would write the reset back into
						     `creating` and open the dialog again. -->
						<select
							name="kind"
							class="select w-full"
							value={creating}
							onchange={(e) => (creating = e.currentTarget.value as Rule['kind'])}
						>
							<option value="category">{t('finance.rules.aCategory')}</option>
							<option value="tag">{t('finance.rules.aTag')}</option>
						</select>
					</Field>
				{/if}
				<Field label={t('ui.name')} span={editing ? 8 : 12} required>
					<OneLine
						name="heading"
						value={editing?.name ?? ''}
						placeholder={(editing?.kind ?? creating) === 'tag'
							? t('finance.rules.tagExample')
							: t('finance.rules.categoryExample')}
						class="input w-full"
						required
						autofocus
					/>
				</Field>
				{#if editing}
					<Field label={t('finance.rules.colour')} span={4}>
						<input
							type="color"
							name="color"
							value={editing.color}
							class="h-9 w-full cursor-pointer border border-gray-300 bg-transparent p-0"
							aria-label={t('finance.rules.colourFor', { name: editing.name })}
						/>
					</Field>
				{/if}
				<Field label={t('finance.rules.pattern')} hint={t('finance.rules.patternHint')} required>
					<OneLine
						name="pattern"
						value={editing?.pattern ?? ''}
						placeholder={(editing?.kind ?? creating) === 'tag'
							? t('finance.rules.tagPatternExample')
							: t('finance.rules.categoryPatternExample')}
						class="input w-full font-mono text-xs"
						required
					/>
				</Field>
			</FormGrid>
		</form>
	{/key}
	<!--
		Which regular expressions these are, said plainly. "Regex" is several
		languages and the differences bite exactly where somebody reaches for
		a `\d` or a lookbehind.
	-->
	<p class="mt-4 max-w-prose text-xs text-gray-500">
		{t('finance.rules.patternsAre')}
		<strong>{t('finance.rules.javascriptRegularExpressions')}</strong>
		{t('finance.rules.ecmascriptMatchedCaseInsensitivelyAndUna')}
		<code>{t('finance.rules.mercado')}</code>
		{t('finance.rules.findsItAnywhereInThe')}
		<code>|</code>
		{t('finance.rules.isOr')} <code>^</code>
		{t('finance.rules.and')} <code>$</code>
		{t('finance.rules.anchor')} <code>\d</code>
		{t('finance.rules.isADigitAndA')} <code>*</code>
		{t('finance.rules.or')} <code>.</code>
		{t('finance.rules.needsABackslash')}
		<a
			href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions/Cheatsheet"
			target="_blank"
			rel="noreferrer"
			class="underline">{t('finance.rules.theFullSyntax')}</a
		>
	</p>
	{#snippet footer()}
		<button class="btn" type="button" onclick={closeForm}>{t('ui.cancel')}</button>
		<button class="btn btn-primary" type="submit" form="rule-form">
			{editing ? t('ui.save') : t('ui.add')}
		</button>
	{/snippet}
</Modal>

<Modal
	open={deleting !== null}
	title={t('finance.rules.deleteThisRule')}
	onclose={() => (deleting = null)}
	size="sm"
>
	{#if deleting}
		<p class="text-sm text-gray-600">
			<strong>{deleting.name}</strong>{t('finance.rules.stopsClaimingTheLineIt', {
				matches: deleting.matches,
				s: deleting.matches === 1 ? '' : 's'
			})}
		</p>
	{/if}
	{#snippet footer()}
		<button class="btn" type="button" onclick={() => (deleting = null)}
			>{t('finance.rules.keepIt')}</button
		>
		<form
			method="post"
			action="?/delete"
			use:enhance={() =>
				({ result, update }) => {
					if (result.type === 'success') deleting = null;
					return update();
				}}
		>
			<input type="hidden" name="id" value={deleting?.id} />
			<button class="btn btn-danger" type="submit" use:armed>{t('ui.delete')}</button>
		</form>
	{/snippet}
</Modal>
