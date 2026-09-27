<script lang="ts">
	import { page } from '$app/state';
	import ShowingCount from '$lib/components/ShowingCount.svelte';
	import SearchField from '$lib/components/SearchField.svelte';
	import StripVerb from '$lib/components/StripVerb.svelte';
	import { openFromUrl } from '$lib/open-from-url.svelte';
	import TagInput from '$lib/components/TagInput.svelte';
	import TagChip from '$lib/components/TagChip.svelte';
	import { momentOf, today } from '$lib/when';
	import { useWhen } from '$lib/when-context.svelte';
	import { enhance } from '$lib/enhance';
	import { setRoomAction } from '$lib/room-action.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import RowCard from '$lib/components/RowCard.svelte';
	import { tagFilterWords } from '$lib/tag-filter-summary';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import TagFilter from '$lib/components/TagFilter.svelte';
	import { tagFilterInUrl } from '$lib/tag-filter-url.svelte';
	import { isTagFiltering, passesTagFilter, NO_TAG_FILTER } from '$lib/tag-filter';
	import { SECTION_COLORS } from '$lib/colors';
	import OneLine from '$lib/components/OneLine.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import NoteFields from '$lib/components/fields/NoteFields.svelte';
	import { resolve } from '$app/paths';
	import { renderMarkdown } from '$lib/markdown';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { armed } from '$lib/actions/armed';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { tick } from 'svelte';
	import type { PageServerData, ActionData } from './$types';
	import { getAction } from '$lib/shortcuts';
	import { keepInView } from '$lib/actions/keep-in-view';
	import { useT } from '$lib/i18n';
	import { Selection } from '$lib/selection.svelte';
	import SelectionBar from '$lib/components/SelectionBar.svelte';
	import SelectBox from '$lib/components/SelectBox.svelte';
	import BatchDialog from '$lib/components/BatchDialog.svelte';
	import NotebookField from '$lib/components/NotebookField.svelte';
	import type { EntryBatchVerb } from '$lib/services/diary';

	const t = useT();
	const now = useWhen();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let showForm = $state(false);
	let showWinsForm = $state(false);
	let editingId: number | null = $state(null);

	/*
	 * The address can ask for one, which is how the receipt after a quick
	 * capture offers a way straight into the entry it just wrote. See
	 * `$lib/open-from-url`.
	 */
	openFromUrl((id) => {
		editingId = id;
		showForm = true;
	});
	let selectedIndex = $state(0);
	/** Which labels to show and which to hide, kept in the address. */
	const tagFilter = tagFilterInUrl();
	let confirmingDeleteId: number | null = $state(null);
	/** How many win boxes the wins dialog opens with. */
	const WINS_TO_START_WITH = 3;
	/** How long an entry stays marked after a `#12` pointing at it is pressed. */
	const REF_HIGHLIGHT_MS = 1500;
	let winInputCount = $state(WINS_TO_START_WITH);
	/** What the search box holds: entries whose words, people or tags contain it. */
	let looking = $state('');
	const winsEnabled = $derived(data.winsEnabled);

	// Tooltip state for #N references
	let tooltip = $state<{ visible: boolean; x: number; y: number; content: string; date: string }>({
		visible: false,
		x: 0,
		y: 0,
		content: '',
		date: ''
	});

	function seqMap() {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- built, read once and thrown away inside this function; nothing tracks it.
		const map = new Map<number, { content: string; createdAt: string }>();
		for (const entry of data.entries) {
			map.set(entry.diarySeq ?? entry.seq, { content: entry.content, createdAt: entry.createdAt });
		}
		return map;
	}

	function matchesSearch(entry: PageServerData['entries'][number], needle: string): boolean {
		if (!needle) return true;
		return [
			entry.content,
			...entry.tags.map((one) => one.name),
			...entry.people.map((one) => one.name)
		]
			.join('\n')
			.toLowerCase()
			.includes(needle);
	}

	const shownEntries = $derived.by(() => {
		const needle = looking.trim().toLowerCase();
		return data.entries.filter(
			(e) =>
				passesTagFilter(
					e.tags.map((one) => one.name),
					tagFilter.current
				) && matchesSearch(e, needle)
		);
	});
	const narrowed = $derived(isTagFiltering(tagFilter.current) || looking.trim() !== '');

	function tagFilterSummary(filter: typeof tagFilter.current): string {
		return tagFilterWords(filter, t('tagFilter.untagged')).join(', ');
	}

	function openEdit(id: number) {
		editingId = id;
		showForm = true;
		showWinsForm = false;
		tick().then(() => {
			document.querySelector<HTMLTextAreaElement>('textarea[name="content"]')?.focus();
		});
	}

	/*
	 * Several entries at once, with the task list's own selection. No "put
	 * away" here: the diary shows every entry, so hiding one would do nothing.
	 */
	const selection = new Selection<EntryBatchVerb>();
	const shownIds = $derived(shownEntries.map((entry) => entry.id));
	const chosenIds = $derived(shownIds.filter((id) => selection.has(id)));
	$effect(() => selection.keep(shownIds));
	const BATCH_LABELS = {
		notebook: 'notebookDetail.batchMove',
		tag: 'notebookDetail.batchTag',
		remove: 'notebookDetail.batchDelete'
	} as const;
	const batchVerbs = $derived(
		(
			[
				['notebook', 'notebook'],
				['tag', 'tag'],
				['remove', 'trash']
			] as const
		).map(([key, icon]) => ({ key, icon, label: t(BATCH_LABELS[key]) }))
	);

	function editingEntry() {
		if (!editingId) return null;
		return data.entries.find((e) => e.id === editingId) ?? null;
	}

	function editingPeopleString(): string {
		const entry = editingEntry();
		return entry ? entry.people.map((p) => p.name).join(', ') : '';
	}

	function editingTagString() {
		const entry = editingEntry();
		if (!entry) return '';
		return entry.tags.map((t) => t.name).join(', ');
	}

	function formatDate(iso: string): string {
		const d = new Date(iso);
		return momentOf(d, now(), { weekday: 'short' });
	}

	function formatDateShort(iso: string): string {
		return iso.slice(0, 10);
	}

	function handleEntriesPointerOver(e: PointerEvent) {
		const target = (e.target as HTMLElement).closest('.diary-ref') as HTMLElement | null;
		if (!target) return;
		const seq = Number(target.dataset.seq);
		const entry = seqMap().get(seq);
		if (!entry) return;
		const rect = target.getBoundingClientRect();
		const preview = entry.content.length > 120 ? entry.content.slice(0, 120) + '…' : entry.content;
		tooltip = {
			visible: true,
			x: rect.left,
			y: rect.top,
			content: preview,
			date: formatDateShort(entry.createdAt)
		};
	}

	function handleEntriesPointerOut(e: PointerEvent) {
		const target = (e.target as HTMLElement).closest('.diary-ref');
		if (!target) return;
		tooltip.visible = false;
	}

	function handleEntriesClick(e: MouseEvent) {
		const target = (e.target as HTMLElement).closest('.diary-ref') as HTMLElement | null;
		if (!target) return;
		e.preventDefault();
		const seq = Number(target.dataset.seq);
		const el = document.getElementById(`diary-${seq}`);
		if (el) {
			el.scrollIntoView({ behavior: 'smooth', block: 'center' });
			// Briefly highlight
			el.classList.add('kb-cursor');
			setTimeout(() => el.classList.remove('kb-cursor'), REF_HIGHLIGHT_MS);
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			// A `<dialog>` closes itself on Escape; `preventDefault()` here cancels
			// that. Nothing on this page needs the key while one is open.
			if (document.querySelector('dialog[open]')) return;
			if (selection.handleKey(e, () => undefined)) return;

			e.preventDefault();
			showForm = false;
			showWinsForm = false;
			editingId = null;
			confirmingDeleteId = null;
			(document.activeElement as HTMLElement)?.blur?.();
			return;
		}

		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		const items = shownEntries;
		if (document.querySelector('dialog[open]')) return;
		if (selection.handleKey(e, () => items[selectedIndex]?.id)) return;
		const action = getAction('/notebooks/diary', e.key);
		if (!action) return;
		e.preventDefault();

		switch (action) {
			case 'navigate-down':
				selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
				break;
			case 'navigate-up':
				selectedIndex = Math.max(selectedIndex - 1, 0);
				break;
			case 'new':
				showForm = true;
				showWinsForm = false;
				editingId = null;
				tick().then(() => {
					const ta = document.querySelector<HTMLTextAreaElement>('textarea[name="content"]');
					ta?.focus();
				});
				break;
			case 'edit':
				if (items.length > 0) openEdit(items[selectedIndex].id);
				break;
		}
	}

	/* This screen's one verb, drawn by the room's bar — see $lib/room-action. */
	setRoomAction(() => ({
		label: t('notebooks.diary.newEntry'),
		open: showForm,
		tour: 'diary-new',
		run: () => {
			showForm = !showForm;
			showWinsForm = false;
			editingId = null;
			if (!showForm) return;
			tick().then(() => {
				const ta = document.querySelector<HTMLTextAreaElement>('textarea[name="content"]');
				ta?.focus();
			});
		}
	}));
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<FormError message={form?.message} />

	<!--
		The wins, in a dialog like every other form here. They were a card
		dropped in above the entries, which pushed the diary down the page
		while it was open.
	-->
	<Modal
		bind:open={showWinsForm}
		error={form?.message}
		title={t('notebooks.diary.wins')}
		onclose={() => (winInputCount = WINS_TO_START_WITH)}
	>
		<form
			id="wins-form"
			method="post"
			action="?/createWins"
			use:enhance={() => {
				return async ({ update, result }) => {
					await update({ reset: false });
					if (result.type === 'success') {
						showWinsForm = false;
						winInputCount = WINS_TO_START_WITH;
					}
				};
			}}
		>
			<FormGrid>
				<Field label={t('ui.date')} span={6}>
					<input autocomplete="off" name="forDate" type="date" value={today(now())} class="input" />
				</Field>
				{#each { length: winInputCount }, i (i)}
					<Field label={t('notebooks.diary.win', { i: i + 1 })} span={12}>
						<OneLine name="win_{i}" class="input" autofocus={i === 0} />
					</Field>
				{/each}
				<div class="col-span-12">
					<button type="button" onclick={() => (winInputCount += 1)} class="btn btn-sm">
						<Icon name="plus" />
						{t('notebooks.diary.addAnother')}
					</button>
				</div>
				<Field label={t('ui.tags')} span={12}>
					<TagInput
						known={page.data.tagVocabulary ?? []}
						placeholder={t('notebooks.diary.tagsCommasOrSpaces')}
					/>
				</Field>
			</FormGrid>
		</form>

		{#snippet footer()}
			<button type="button" class="btn" onclick={() => (showWinsForm = false)}>
				{t('ui.cancel')}
			</button>
			<button type="submit" form="wins-form" class="btn btn-primary">
				{t('notebooks.diary.saveWins')}
			</button>
		{/snippet}
	</Modal>

	<Modal
		bind:open={showForm}
		error={form?.message}
		title={editingId ? t('notebooks.diary.editEntry') : t('notebooks.diary.newEntry')}
		onclose={() => (editingId = null)}
	>
		<form
			id="entry-form"
			method="post"
			action={editingId ? '?/update' : '?/create'}
			use:enhance={() => {
				return async ({ update, result }) => {
					await update({ reset: false });
					if (result.type === 'success') {
						showForm = false;
						editingId = null;
					}
				};
			}}
		>
			{#if editingId}
				<input type="hidden" name="id" value={editingId} />
			{/if}

			<FormGrid>
				<!-- No notebook picker while writing: the diary is not one notebook
				     among others, and the page has already answered where this goes.
				     Editing is a later decision, and there it can move. -->
				<NoteFields
					content={editingId ? (editingEntry()?.content ?? '') : ''}
					tags={editingId ? editingTagString() : ''}
					notebook={editingId !== null}
					notebooks={data.notebooks}
				/>

				<Field
					label={t('notebooks.diary.people')}
					span={6}
					hint={t('notebooks.diary.anyoneThisWasAbout')}
				>
					<input
						autocomplete="off"
						name="people"
						type="text"
						list="known-people"
						value={editingId ? editingPeopleString() : ''}
						placeholder={t('notebooks.diary.anaJoão')}
						class="input"
					/>
					<datalist id="known-people">
						{#each data.allPeople as person (person.id)}
							<option value={person.name}></option>
						{/each}
					</datalist>
				</Field>
			</FormGrid>
		</form>

		{#snippet footer()}
			<button
				type="button"
				class="btn"
				onclick={() => {
					showForm = false;
					editingId = null;
				}}>{t('ui.cancel')}</button
			>
			<button type="submit" form="entry-form" class="btn btn-primary">
				{editingId ? t('ui.save') : t('notebooks.diary.postEntry')}
			</button>
		{/snippet}
	</Modal>

	<!--
		One surface, and an entry is a row on it — the controls along its top
		and the empty state inside it, the shape a notebook's Notes tab has.
	-->
	<RoomSurface accent={SECTION_COLORS.diary} dataTour="diary-list">
		{#snippet tools()}
			{#if data.entries.length > 0 || winsEnabled}
				<FilterBar
					name="diary"
					on={narrowed}
					summary={tagFilterSummary(tagFilter.current)}
					onclear={() => {
						tagFilter.current = NO_TAG_FILTER;
						looking = '';
						selectedIndex = 0;
					}}
				>
					{#snippet lead()}
						<SearchField bind:value={looking} label={t('notebooks.diary.searchTheDiary')} />
					{/snippet}
					{#snippet count()}
						<!-- Held open at the count of every entry — see `.count-slot`. -->
						<ShowingCount
							total={data.entries.length}
							shown={shownEntries.length}
							said={(count) => t('notebooks.diary.showingCount', { count })}
						/>
					{/snippet}
					{#snippet verb()}
						{#if winsEnabled}
							<StripVerb
								icon="plus"
								label={t('notebooks.diary.newWins')}
								onclick={() => {
									showWinsForm = true;
									showForm = false;
									editingId = null;
									winInputCount = WINS_TO_START_WITH;
								}}
								data-tour="diary-wins"
							/>
						{/if}
					{/snippet}
					{#if data.allTags.length > 0 || isTagFiltering(tagFilter.current)}
						<TagFilter
							tags={data.allTags.map((tag) => tag.name)}
							value={tagFilter.current}
							onchange={(next) => {
								tagFilter.current = next;
								selectedIndex = 0;
							}}
							name="diary-tags"
							class="min-w-36 flex-1 sm:flex-none"
						/>
					{/if}
				</FilterBar>
			{/if}
		{/snippet}
		{#if data.entries.length === 0}
			<EmptyState
				icon="diary"
				title={t('notebooks.diary.theJournalIsEmpty')}
				description={t('notebooks.diary.whateverHappenedTodayInAs')}
			/>
		{:else}
			<SelectionBar
				{selection}
				visible={shownIds}
				verbs={batchVerbs}
				selectAllLabel={t('notebookDetail.selectVisibleNotes')}
				dataTour="diary-selection"
			/>
			<!-- Inside the surface, so the control that emptied it stays to undo it. -->
			{#if shownEntries.length === 0}
				<EmptyState
					icon="search"
					title={t('todoRows.nothingToShow')}
					description={t('tagFilter.nothingMatches')}
				/>
			{/if}
			<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
			<div
				class="divide-y divide-gray-200"
				onpointerover={handleEntriesPointerOver}
				onpointerout={handleEntriesPointerOut}
				onclick={handleEntriesClick}
			>
				{#each shownEntries as entry, i (entry.id)}
					<!--
						The card a note is drawn on — `RowCard`: the entry's number in the
						rail, the writing and when beside it, the people and labels along
						the foot with the verbs at the end of that line.
					-->
					<article
						use:keepInView={i === selectedIndex}
						id="diary-{entry.diarySeq ?? entry.seq}"
						class="flex items-stretch gap-x-4 px-4 py-3 {i === selectedIndex ? 'kb-cursor' : ''}"
						class:bg-gray-100={selection.selecting && selection.has(entry.id)}
					>
						<RowCard quiet={selection.selecting}>
							{#snippet rail()}
								{#if selection.selecting}
									<SelectBox
										checked={selection.has(entry.id)}
										label={t('notebookDetail.selectNote', {
											title: `#${entry.diarySeq ?? entry.seq}`
										})}
										ontoggle={() => selection.toggle(entry.id)}
									/>
								{/if}
								<!-- The diary's own number, the one another entry points at as
								     `#12`: the thirtieth entry is #30, not the account's count. -->
								<span class="tabular min-w-7 text-center text-[11px] text-gray-500"
									>#{entry.diarySeq ?? entry.seq}</span
								>
							{/snippet}

							{#snippet labels()}
								<!-- `@` in front of a person, the way `#` goes in front of a tag. -->
								{#each entry.people as person (person.id)}
									<a href={resolve('/notebooks/people')} class="chip">@{person.name}</a>
								{/each}
								{#each entry.tags as tag (tag.id)}
									<TagChip
										name={tag.name}
										active={tagFilter.current.include.includes(tag.name)}
										onclick={() => {
											const held = tagFilter.current;
											if (!held.include.includes(tag.name))
												tagFilter.current = {
													...held,
													include: [...held.include, tag.name],
													exclude: held.exclude.filter((one) => one !== tag.name)
												};
											selectedIndex = 0;
										}}
									/>
								{/each}
							{/snippet}

							{#snippet controls()}
								<button
									title={t('ui.edit')}
									aria-label={t('ui.edit')}
									onclick={() => openEdit(entry.id)}
									class="icon-btn"
								>
									<Icon name="edit" />
								</button>
								{#if confirmingDeleteId === entry.id}
									<form
										method="post"
										action="?/delete"
										use:enhance={() => {
											return async ({ update }) => {
												await update({ reset: false });
												confirmingDeleteId = null;
											};
										}}
										class="flex items-center gap-2"
									>
										<input type="hidden" name="id" value={entry.id} />
										<button
											type="button"
											class="btn btn-sm"
											onclick={() => (confirmingDeleteId = null)}>{t('ui.cancel')}</button
										>
										<button type="submit" class="btn btn-danger btn-sm" use:armed>
											{t('notebookDetail.yesDelete')}
										</button>
									</form>
								{:else}
									<button
										title={t('ui.delete')}
										aria-label={t('ui.delete')}
										type="button"
										onclick={() => (confirmingDeleteId = entry.id)}
										class="icon-btn icon-btn-danger"
									>
										<Icon name="trash" />
									</button>
								{/if}
							{/snippet}

							<div class="md text-sm text-gray-900">
								<!-- `renderMarkdown` escapes every character of the input before it emits a
								     tag, and emits only attributes it writes itself. See `$lib/markdown.ts`. -->
								<!-- eslint-disable-next-line svelte/no-at-html-tags -->
								{@html renderMarkdown(entry.content)}
							</div>
							<span class="tabular mt-0.5 text-xs text-gray-500">
								{formatDate(entry.createdAt)}
								{#if entry.forDate}
									· {t('notebooks.diary.for', { forDate: entry.forDate })}
								{/if}
								{#if entry.updatedAt !== entry.createdAt}
									{t('notebooks.diary.edited', { updatedAt: formatDate(entry.updatedAt) })}
								{/if}
							</span>
						</RowCard>
					</article>
				{/each}
			</div>
		{/if}
	</RoomSurface>

	<BatchDialog
		{selection}
		ids={chosenIds}
		action="?/batch"
		id="diary-batch-form"
		title={selection.verb ? t(BATCH_LABELS[selection.verb as keyof typeof BATCH_LABELS]) : ''}
		destructive={selection.verb === 'remove'}
		done={(count) => t('notebookDetail.batchUpdated', { count })}
	>
		{#snippet fields(verb)}
			{#if verb === 'notebook'}
				<NotebookField
					notebooks={data.notebooks}
					holds="notes"
					value={null}
					span={12}
					noneLabel={t('sections.diary.label')}
				/>
			{:else if verb === 'tag'}
				<Field label={t('todoRows.addLabels')} span={12}
					><OneLine name="add" class="input" autofocus /></Field
				>
				<Field label={t('todoRows.removeLabels')} span={12}
					><OneLine name="remove" class="input" /></Field
				>
			{:else}
				<p class="col-span-12 text-sm text-gray-700">{t('notebookDetail.deleteSelectedNotes')}</p>
			{/if}
		{/snippet}
	</BatchDialog>
</div>

{#if tooltip.visible}
	<div
		class="pointer-events-none fixed z-50 max-w-xs border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm"
		style="left: {tooltip.x}px; top: {tooltip.y - 8}px; transform: translateY(-100%);"
	>
		<div class="mb-1 font-medium text-gray-500">{tooltip.date}</div>
		<div class="text-gray-700">{tooltip.content}</div>
	</div>
{/if}

<style>
	/* A pointer at another entry: a link in the section's own thin accent,
	   not a colour of its own. */
	:global(.diary-ref) {
		text-decoration: underline;
		text-decoration-color: var(--section-accent);
		text-underline-offset: 2px;
		cursor: pointer;
	}
	:global(.diary-ref:hover) {
		text-decoration-thickness: 2px;
	}
</style>
