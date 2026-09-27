<script lang="ts">
	import Picker from '$lib/components/Picker.svelte';
	import { enhance } from '$lib/enhance';
	import Swatch from '$lib/components/Swatch.svelte';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import { setRoomAction } from '$lib/room-action.svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Card from '$lib/components/Card.svelte';
	import CategoryDonut from '$lib/components/CategoryDonut.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import { armed } from '$lib/actions/armed';
	import { formatMoney, type Currency } from '$lib/money';
	import type { PageServerData, ActionData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	const currency = $derived(data.currency as Currency);
	type Rule = PageServerData['rules'][number];

	const categories = $derived(data.rules.filter((r) => r.kind === 'category'));
	const tags = $derived(data.rules.filter((r) => r.kind === 'tag'));

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
	setRoomAction(() => ({ label: t('finance.rules.newRule'), run: () => openNew('category') }));

	function filter(changes: { ledger?: number; months?: number; showing?: string }) {
		const params: [string, string][] = [];
		const ledger = changes.ledger ?? data.ledgerId;
		const months = changes.months ?? data.months;
		const showing = changes.showing ?? data.showing;
		if (ledger) params.push(['ledger', String(ledger)]);
		if (months !== 12) params.push(['months', String(months)]);
		if (showing) params.push(['showing', showing]);
		// The path is resolved; the rule cannot see through the appended query.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(`${resolve('/finance/rules')}?${new URLSearchParams(params)}`, { noScroll: true });
	}

	const WINDOWS = [3, 6, 12, 24];
</script>

<!--
	One surface: what the totals are counted over along its top, where the
	money went under that, and the rules that sorted it as two panes of the
	same object — categories partition, tags overlap.
-->
<RoomSurface>
	{#snippet tools()}
		<div class="flex w-full flex-wrap items-center gap-2">
			<Picker
				value={String(data.ledgerId)}
				options={[
					{ value: '0', label: t('finance.rules.everyLedger') },
					...data.ledgers.map((l) => ({ value: String(l.id), label: l.name }))
				]}
				onpick={(next) => filter({ ledger: Number(next) })}
				label={t('finance.rules.everyLedger')}
			/>
			<Picker
				value={String(data.months)}
				options={WINDOWS.map((w) => ({
					value: String(w),
					label: t('finance.rules.lastMonths', { w })
				}))}
				onpick={(next) => filter({ months: Number(next) })}
				label={t('finance.rules.lastMonths', { w: data.months })}
			/>
			{#if data.unsorted > 0}
				<a href={resolve('/finance/ledgers')} class="btn btn-sm btn-quiet ml-auto"
					>{t('finance.rules.uncategorized', { unsorted: data.unsorted })}</a
				>
			{:else}
				<span class="ml-auto text-xs text-gray-500">{t('finance.rules.everyOutgoingLineHasA')}</span
				>
			{/if}
		</div>
	{/snippet}

	<!-- What the rules add up to. The legend reads across to its amounts, so it
	     is kept to a width where the two are still one line. -->
	<Card title={t('finance.rules.whereItWent')} pane class="border-b border-gray-200">
		<div class="max-w-3xl">
			<CategoryDonut slices={data.slices} {currency} />
		</div>
	</Card>

	<FormError message={form?.message} />

	<div class="grid grid-cols-1 lg:grid-cols-2">
		{#each [{ kind: 'category' as const, title: t('finance.rules.categories'), rules: categories, blurb: t('finance.rules.aLineBelongsToThe') }, { kind: 'tag' as const, title: t('finance.rules.tags'), rules: tags, blurb: t('finance.rules.everyTagThatMatchesApplies') }] as group, g (group.kind)}
			<Card
				title={group.title}
				description={group.blurb}
				flush
				pane
				class={g > 0 ? 'border-t border-gray-200 lg:border-t-0 lg:border-l' : ''}
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
					<EmptyState compact icon="sort" title={t('finance.rules.noneYet')} />
				{:else}
					<ul class="divide-y divide-gray-200">
						{#each group.rules as rule, index (rule.id)}
							<li class="list-row">
								<div class="list-row-main flex min-w-0 items-center gap-2">
									<Swatch color={rule.color} shape="dot" />
									<span class="shrink-0 text-sm font-medium text-gray-900">{rule.name}</span>
									<code class="min-w-0 flex-1 truncate text-xs text-gray-500" title={rule.pattern}>
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
											pressing it again puts them away.
										-->
										<button
											class="btn btn-sm tabular shrink-0"
											title={t('finance.rules.whichLinesThisClaims')}
											aria-pressed={data.showing === String(rule.id)}
											onclick={() =>
												filter({
													showing: data.showing === String(rule.id) ? '' : String(rule.id)
												})}
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
	</div>

	<!--
		The lines behind a number.

		Under the two panes rather than inside one of them: it is the answer
		to a question asked in either, and a panel that appears inside one
		would push the other pane's rows around.
	-->
	{#if data.showing}
		<Card title={data.showingLabel} flush pane class="border-t border-gray-200">
			{#snippet actions()}
				<button
					class="icon-btn"
					title={t('ui.close')}
					aria-label={t('ui.close')}
					onclick={() => filter({ showing: '' })}
				>
					<Icon name="close" />
				</button>
			{/snippet}
			{#if data.lines.length === 0}
				<EmptyState compact icon="search" title={t('finance.rules.nothingHere')} />
			{:else}
				<ul class="divide-y divide-gray-200">
					{#each data.lines as line (line.id)}
						<li
							class="flex items-baseline gap-3 px-4 py-2"
							style={line.categoryColor ? `background-color: ${line.categoryColor}2b` : ''}
						>
							<span class="tabular shrink-0 text-xs text-gray-500">{line.occurredOn}</span>
							<span class="min-w-0 flex-1 truncate text-sm text-gray-900">{line.description}</span>
							{#if line.ledgerName}
								<span class="shrink-0 text-xs text-gray-500">{line.ledgerName}</span>
							{/if}
							<span
								class="shrink-0 text-sm tabular-nums {line.amountCents < 0
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

<!--
	Which regular expressions these are, said plainly. "Regex" is several
	languages and the differences bite exactly where somebody reaches for
	a `\d` or a lookbehind.
-->
<p class="mt-3 text-xs text-gray-500">
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
						<select name="kind" class="select w-full" bind:value={creating}>
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
