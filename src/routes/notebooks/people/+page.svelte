<script lang="ts">
	import { routeGlyph } from '$lib/glyphs';
	import { civilOf, dayOf, momentOf, today } from '$lib/when';
	import { useWhen } from '$lib/when-context.svelte';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { setRoomAction } from '$lib/room-action.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import { getAction, keyFor } from '$lib/shortcuts';
	import { enhance } from '$lib/enhance';
	import FormError from '$lib/components/FormError.svelte';
	import { armed } from '$lib/actions/armed';
	import { listCursor } from '$lib/actions/list-cursor';
	import Card from '$lib/components/Card.svelte';
	import Banner from '$lib/components/Banner.svelte';
	import DetailHeader from '$lib/components/DetailHeader.svelte';
	import RoomToolbar from '$lib/components/RoomToolbar.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import SearchField from '$lib/components/SearchField.svelte';
	import ShowingCount from '$lib/components/ShowingCount.svelte';
	import SortControl from '$lib/components/SortControl.svelte';
	import SplitColumns from '$lib/components/SplitColumns.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import FoldedText from '$lib/components/FoldedText.svelte';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { birthdayDay, RELATIONSHIPS, RELATIONSHIP_LABELS } from '$lib/people';
	import type { PageServerData, ActionData } from './$types';
	import type { PlainKey } from '$lib/i18n/keys';
	import Written from '$lib/components/Written.svelte';
	import { useT } from '$lib/i18n';

	const t = useT();
	const now = useWhen();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	type Person = PageServerData['people'][number];

	let showForm = $state(false);
	let editingId = $state<number | null>(null);

	/*
	 * The birthday as it is being typed, because the checkbox under it appears
	 * with the date rather than with the saved person.
	 */
	let bornOn = $state('');
	let tellMe = $state(true);
	/** The face's own form, submitted the moment a file is chosen. */
	let pictureForm = $state<HTMLFormElement>();
	let uploadingFace = $state(false);
	/** Said here rather than by the server, for the ones never sent. */
	let faceProblem = $state('');
	let confirmDelete = $state<number | null>(null);
	/*
	 * Where j/k stands. Nowhere until a key is pressed — a first row wearing
	 * the cursor beside a panel saying nobody is chosen read as a contradiction
	 * — and on whoever is open when somebody is.
	 */
	// svelte-ignore state_referenced_locally
	let cursor = $state(data.people.findIndex((p) => p.id === data.selected));
	/** What the search box holds: people whose name, relationship or notes contain it. */
	let looking = $state('');

	/*
	 * How wide the list is. The drag lives in `SplitColumns` — the same
	 * handle the shelf and the inventory have — and is written down once, when
	 * it is let go.
	 */
	// svelte-ignore state_referenced_locally
	let panelRem = $state(data.listPanelRem);
	let panelForm = $state<HTMLFormElement>();

	const ORDERS = ['name', 'birthday', 'mentions'] as const;
	type Order = (typeof ORDERS)[number];
	const ORDER_LABELS: Record<Order, PlainKey> = {
		name: 'ui.name',
		birthday: 'notebooks.people.nextBirthday',
		mentions: 'notebooks.people.mentions'
	};
	/* Each order's natural direction: A to Z, the soonest first, the most first. */
	const NATURAL: Record<Order, 'asc' | 'desc'> = {
		name: 'asc',
		birthday: 'asc',
		mentions: 'desc'
	};
	let order = $state<Order>('name');
	let direction = $state<'asc' | 'desc'>('asc');

	/** Days from today to their next birthday; people without one sort last. */
	function daysToBirthday(person: Person): number {
		const day = birthdayDay(person.birthday);
		if (!day) return Number.POSITIVE_INFINITY;
		const now_ = today(now());
		const year = Number(now_.slice(0, 4));
		const at = (y: number) => Date.UTC(y, Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
		const from = Date.UTC(year, Number(now_.slice(5, 7)) - 1, Number(now_.slice(8, 10)));
		const next = at(year) >= from ? at(year) : at(year + 1);
		return Math.round((next - from) / 86_400_000);
	}

	const shownPeople = $derived.by(() => {
		const needle = looking.trim().toLowerCase();
		const found = needle
			? data.people.filter((one) =>
					[one.name, t(RELATIONSHIP_LABELS[one.relationship]), one.notes ?? '']
						.join('\n')
						.toLowerCase()
						.includes(needle)
				)
			: data.people;
		const sign = direction === 'asc' ? 1 : -1;
		const byName = (a: Person, b: Person) => a.name.localeCompare(b.name);
		return [...found].sort((a, b) => {
			if (order === 'mentions') return sign * (a.mentions - b.mentions) || byName(a, b);
			if (order === 'birthday') {
				const da = daysToBirthday(a);
				const db = daysToBirthday(b);
				// Nobody without a birthday jumps the queue, whichever way it runs.
				if (da === db) return byName(a, b);
				if (!Number.isFinite(da)) return 1;
				if (!Number.isFinite(db)) return -1;
				return sign * (da - db);
			}
			return sign * byName(a, b);
		});
	});

	const editing = $derived(
		editingId ? (data.people.find((p) => p.id === editingId) ?? null) : null
	);
	const selectedPerson = $derived(data.people.find((p) => p.id === data.selected) ?? null);

	const personHref = (person: Person) => resolve(`/notebooks/people?person=${person.id}`);

	function openCreate() {
		editingId = null;
		bornOn = '';
		tellMe = true;
		showForm = true;
	}

	function openEdit(person: Person) {
		editingId = person.id;
		bornOn = person.birthday ?? '';
		tellMe = person.remindOnBirthday;
		showForm = true;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		if (e.key === 'Escape') {
			showForm = false;
			editingId = null;
			confirmDelete = null;
			return;
		}
		const action = getAction('/notebooks/people', e);
		const here = shownPeople[cursor];
		if (action === 'new') {
			e.preventDefault();
			openCreate();
		}
		if (action === 'edit' && here) {
			e.preventDefault();
			openEdit(here);
		}
		if (action === 'open' && here) {
			e.preventDefault();
			// Already resolved: `personHref` builds it with `resolve()`.
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			void goto(personHref(here), { noScroll: true, keepFocus: true });
		}
		if (action === 'navigate-down' || action === 'navigate-up') {
			e.preventDefault();
			const max = shownPeople.length - 1;
			if (max < 0) return;
			cursor = Math.min(Math.max(cursor + (action === 'navigate-down' ? 1 : -1), 0), max);
		}
	}

	/* This screen's one verb, drawn by the room's bar — see $lib/room-action. */
	setRoomAction(() => ({
		label: t('notebooks.people.newPerson'),
		tour: 'people-new',
		kbd: keyFor('/notebooks/people', 'new'),
		run: openCreate
	}));
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- A face, or the initial where there is not one yet: a silhouette says
     "missing", an initial says "this one". -->
{#snippet face(person: Person, size: 'row' | 'head')}
	{#if person.pictureId}
		<img
			src="/media/{person.pictureId}"
			alt={person.name}
			loading="lazy"
			data-view
			class="{size === 'row'
				? 'size-8'
				: 'size-12'} shrink-0 cursor-zoom-in rounded-full border border-gray-200 bg-white object-cover"
		/>
	{:else}
		<span
			aria-hidden="true"
			class="flex {size === 'row'
				? 'size-8 text-xs'
				: 'size-12 text-lg'} shrink-0 items-center justify-center rounded-full border border-dashed border-gray-300 bg-gray-100 font-medium text-gray-500"
		>
			{person.name.trim().charAt(0).toUpperCase()}
		</span>
	{/if}
{/snippet}

<!-- What there is to say about somebody in a line, in the same order on the
     row and over their page: how you know them, the birthday, the mentions. -->
{#snippet facts(person: Person)}
	<span>{t(RELATIONSHIP_LABELS[person.relationship])}</span>
	{#if birthdayDay(person.birthday)}
		<span aria-hidden="true">·</span>
		<span class="inline-flex items-center gap-1">
			<Icon name="cake" class="size-3.5" />
			<span class="tabular">{dayOf(birthdayDay(person.birthday)!, now())}</span>
		</span>
	{/if}
	<span aria-hidden="true">·</span>
	<span class="tabular">{t('notebooks.people.mentionsCount', { count: person.mentions })}</span>
{/snippet}

{#snippet deleteControl(person: Person)}
	{#if confirmDelete === person.id}
		<form
			method="post"
			action="?/delete"
			use:enhance={() =>
				async ({ update, result }) => {
					confirmDelete = null;
					await update();
					if (result.type === 'success' && person.id === data.selected)
						await goto(resolve('/notebooks/people'), { noScroll: true });
				}}
			class="flex items-center gap-1"
		>
			<input type="hidden" name="id" value={person.id} />
			<button type="button" onclick={() => (confirmDelete = null)} class="btn btn-sm"
				>{t('ui.cancel')}</button
			>
			<button class="btn btn-danger btn-sm" use:armed>{t('notebooks.people.yesDelete')}</button>
		</form>
	{:else}
		<button
			title={t('ui.delete')}
			aria-label={t('ui.delete')}
			onclick={() => (confirmDelete = person.id)}
			class="icon-btn icon-btn-danger"
		>
			<Icon name="trash" />
		</button>
	{/if}
{/snippet}

{#snippet orderControl()}
	<SortControl
		value={order}
		options={ORDERS}
		labels={ORDER_LABELS}
		{direction}
		onpick={(next) => {
			order = next;
			direction = NATURAL[next];
		}}
		onflip={() => (direction = direction === 'asc' ? 'desc' : 'asc')}
		label={t('notebooks.people.orderPeopleBy')}
	/>
{/snippet}

<div class="space-y-4">
	<!--
		No second heading: the room's name is above and the People tab is lit,
		so a page saying "People" under both said it three times.
	-->

	<FormError message={form?.message} />

	<!--
		The list and whoever you picked are one object: the list chooses and the
		column beside it shows, so the divider is a seam in one surface — the
		same handle the notebooks shelf and the inventory have. On a phone there
		is one column, and it is whichever of the two you are looking at.
	-->
	<div class="room-surface">
		<SplitColumns
			bind:rem={panelRem}
			label={t('notebooks.widenOrNarrowTheList')}
			onsettle={() => panelForm?.requestSubmit()}
		>
			{#snippet left()}
				<div class:hidden={!!selectedPerson} class="min-w-0 lg:!block">
					<Card flush pane>
						{#if data.people.length === 0}
							<EmptyState
								icon={routeGlyph('/notebooks/people')!}
								title={t('notebooks.people.nobodyYet')}
								description={t('notebooks.people.addThePeopleWhoTurn')}
							>
								{#snippet action()}
									<button onclick={openCreate} class="btn btn-primary">
										<Icon name="plus" />
										{t('notebooks.people.newPerson')}
									</button>
								{/snippet}
							</EmptyState>
						{:else}
							<RoomToolbar inset>
								{#snippet tools()}
									<FilterBar name="people" trailing={orderControl}>
										{#snippet lead()}
											<SearchField
												bind:value={looking}
												label={t('notebooks.people.searchPeople')}
											/>
										{/snippet}
										{#snippet count()}
											<ShowingCount
												total={data.people.length}
												shown={shownPeople.length}
												said={(count) => t('notebooks.people.showingCount', { count })}
											/>
										{/snippet}
									</FilterBar>
								{/snippet}
							</RoomToolbar>
							{#if shownPeople.length === 0}
								<EmptyState filtered onclear={() => (looking = '')} />
							{/if}
							<div class="divide-y divide-gray-200" data-tour="people-list">
								{#each shownPeople as person, i (person.id)}
									<!--
										The shared row: the face in the rail, so the name starts on
										the column every other list's words start on, and the row's
										two verbs at its right in the shared order.
									-->
									<div
										use:listCursor={cursor === i}
										data-row
										class="list-row"
										class:bg-gray-100={person.id === data.selected}
									>
										<!-- Already resolved: `personHref` builds it with `resolve()`. -->
										<!-- eslint-disable svelte/no-navigation-without-resolve -->
										<a
											href={personHref(person)}
											class="row-rail justify-center"
											tabindex="-1"
											aria-hidden="true"
										>
											{@render face(person, 'row')}
										</a>
										<a
											href={personHref(person)}
											aria-current={person.id === data.selected ? 'true' : undefined}
											class="list-row-main min-w-0 text-sm text-gray-900 hover:underline"
										>
											<!-- The name gets the line; everything small about them gets
											     the one under it. -->
											<span class="block font-medium break-words">{person.name}</span>
											<span class="flex flex-wrap items-center gap-x-1.5 text-xs text-gray-500">
												{@render facts(person)}
											</span>
										</a>
										<!-- eslint-enable svelte/no-navigation-without-resolve -->

										<div class="list-row-actions">
											<button
												title={t('ui.edit')}
												aria-label={t('ui.edit')}
												onclick={() => openEdit(person)}
												class="icon-btn"
											>
												<Icon name="edit" />
											</button>
											{@render deleteControl(person)}
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</Card>
				</div>
			{/snippet}

			{#snippet right()}
				<!--
					Whoever you picked, headed the way a notebook's own page is: the
					face, the name, the line about them, and what can be done to them.
					On a phone it replaces the list, and the way back is on it.
				-->
				<div class:hidden={!selectedPerson} class="min-w-0 lg:!block">
					<Card flush pane>
						{#if selectedPerson}
							<DetailHeader
								surface
								pane
								title={selectedPerson.name}
								back={{
									href: resolve('/notebooks/people'),
									label: t('notebooks.people.allPeople')
								}}
							>
								{#snippet lead()}
									<!-- The face is where somebody looks when they want to change it. -->
									<button
										type="button"
										onclick={() => openEdit(selectedPerson)}
										title={selectedPerson.pictureId
											? t('notebooks.people.changeTheirPicture', { name: selectedPerson.name })
											: t('notebooks.people.addAPictureOf', { name: selectedPerson.name })}
										aria-label={selectedPerson.pictureId
											? t('notebooks.people.changeTheirPicture', { name: selectedPerson.name })
											: t('notebooks.people.addAPictureOf', { name: selectedPerson.name })}
										class="rounded-full transition hover:opacity-80"
									>
										{@render face(selectedPerson, 'head')}
									</button>
								{/snippet}
								{#snippet meta()}
									<p class="flex flex-wrap items-center gap-x-1.5 text-xs text-gray-500">
										{@render facts(selectedPerson)}
										{#if selectedPerson.phone}
											<span aria-hidden="true">·</span>
											<a href="tel:{selectedPerson.phone}" class="tabular hover:underline"
												>{selectedPerson.phone}</a
											>
										{/if}
										{#if selectedPerson.email}
											<span aria-hidden="true">·</span>
											<a href="mailto:{selectedPerson.email}" class="hover:underline"
												>{selectedPerson.email}</a
											>
										{/if}
									</p>
									{#if selectedPerson.notes}
										<FoldedText text={selectedPerson.notes} class="mt-1" />
									{/if}
								{/snippet}
								{#snippet actions()}
									<div class="row-actions controls-sm flex items-center gap-1">
										<button
											title={t('ui.edit')}
											aria-label={t('ui.edit')}
											onclick={() => openEdit(selectedPerson)}
											class="icon-btn"
										>
											<Icon name="edit" />
										</button>
										{@render deleteControl(selectedPerson)}
									</div>
								{/snippet}
							</DetailHeader>

							{#if data.entries.length === 0}
								<EmptyState
									compact
									icon="diary"
									title={t('notebooks.people.nothingWrittenAboutYet', {
										name: selectedPerson.name
									})}
									description={t('notebooks.people.mentionThemInADiary')}
								/>
							{:else}
								<div class="divide-y divide-gray-200 border-t border-gray-200">
									{#each data.entries as entry (entry.id)}
										<!-- The entry's number in the rail, where the diary has it, and
										     the way to it in the diary itself. -->
										<article class="list-row items-start">
											<a
												href={resolve(`/notebooks/diary#diary-${entry.seq}`)}
												class="row-rail tabular pt-0.5 text-xs text-gray-500 hover:text-gray-900 hover:underline"
												>#{entry.seq}</a
											>
											<div class="list-row-main">
												<Written content={entry.content} />
												<p class="tabular mt-1 text-xs text-gray-500">
													{momentOf(entry.createdAt, now())}{#if entry.forDate}{t(
															'notebooks.people.nbspFor'
														)}
														{civilOf(entry.forDate, now())}{/if}
												</p>
											</div>
										</article>
									{/each}
								</div>
							{/if}
						{:else}
							<EmptyState
								icon="diary"
								title={t('notebooks.people.nobodySelected')}
								description={t('notebooks.people.pickSomebodyToSeeEverything')}
							/>
						{/if}
					</Card>
				</div>
			{/snippet}
		</SplitColumns>
	</div>

	<form
		method="POST"
		action="?/setPanelWidth"
		data-quiet
		class="hidden"
		bind:this={panelForm}
		use:enhance={() => async () => {}}
	>
		<input type="hidden" name="rem" value={panelRem} />
	</form>
</div>

<Modal
	bind:open={showForm}
	error={form?.message}
	onclose={() => (editingId = null)}
	title={editingId ? t('notebooks.people.editPerson') : t('notebooks.people.newPerson')}
	size="sm"
>
	<form
		id="person-form"
		method="post"
		action={editingId ? '?/update' : '?/create'}
		use:enhance={() =>
			async ({ update, result }) => {
				await update({ reset: result.type === 'success' });
				if (result.type === 'success') {
					showForm = false;
					editingId = null;
				}
			}}
	>
		{#if editingId}
			<input type="hidden" name="id" value={editingId} />
		{/if}

		<FormGrid>
			<!--
				Six and six rather than eight and four: "How you know them" wrapped
				onto a second line in the narrow column, which pushed its select a
				line below the name box beside it.
			-->
			<Field label={t('ui.name')} span={6} required>
				<OneLine name="label" value={editing?.name ?? ''} class="input" required />
			</Field>

			<Field label={t('notebooks.people.howYouKnowThem')} span={6}>
				<select name="relationship" class="select">
					{#each RELATIONSHIPS as value (value)}
						<option {value} selected={(editing?.relationship ?? 'other') === value}>
							{t(RELATIONSHIP_LABELS[value])}
						</option>
					{/each}
				</select>
			</Field>

			<!--
				A birthday you only half know is the ordinary case, so the year is
				optional: `--03-14` is the vCard spelling and what the field stores.
				A plain date input cannot express it, which is why this is text.

				`bornOn`, `theirPhone`, `theirEmail` rather than the obvious names:
				a browser classifies a field by its name before it reads
				autocomplete, so calling this one after the address field it
				resembles would offer YOUR details while you are typing somebody
				else's. tests/autofill-field-names.test.ts is the rule, and it
				reads the markup literally — including comments.
			-->
			<Field
				label={t('notebooks.people.birthday')}
				span={4}
				hint={t('notebooks.people.19900314Or0314WithoutThe')}
			>
				<input
					name="bornOn"
					autocomplete="off"
					placeholder="1990-03-14"
					bind:value={bornOn}
					class="input"
				/>
			</Field>

			<!--
				Only once there is a date to be told about. A checkbox offering to
				announce a birthday nobody has entered is a control that does
				nothing, and it appears the moment one is typed rather than after
				the form is saved.
			-->
			{#if bornOn.trim()}
				<Field label={t('notebooks.people.onTheDay')} span={4}>
					<label class="flex items-center gap-2 py-2 text-sm text-gray-700">
						<input type="checkbox" name="tellMe" checked={tellMe} />
						{t('notebooks.people.tellMeThatMorning')}
					</label>
				</Field>
			{/if}

			<Field label={t('notebooks.people.phone')} span={4}>
				<input
					name="theirPhone"
					type="tel"
					autocomplete="off"
					value={editing?.phone ?? ''}
					class="input"
				/>
			</Field>

			<Field label={t('notebooks.people.email')} span={4}>
				<input
					name="theirEmail"
					type="email"
					autocomplete="off"
					value={editing?.email ?? ''}
					class="input"
				/>
			</Field>

			<Field label={t('ui.notes')} span={12}>
				<textarea name="notes" rows="3" class="textarea">{editing?.notes ?? ''}</textarea>
			</Field>
		</FormGrid>
	</form>

	<!--
		The picture, in a form of its own, and only once the person exists.

		Two forms because they are two acts: the fields are saved when you press
		Save, and a picture is stored the moment you choose one — there is no
		half-uploaded state to keep and nothing to press afterwards. A nested form
		is not valid HTML anyway.
	-->
	{#if editingId}
		<div class="mt-4 flex flex-wrap items-center gap-3 border-t border-gray-200 pt-4">
			{#if editing?.pictureId}
				<img
					src="/media/{editing.pictureId}"
					alt=""
					class="size-14 shrink-0 rounded-full border border-gray-200 bg-white object-cover"
				/>
			{:else}
				<span
					aria-hidden="true"
					class="flex size-14 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-100 text-lg font-medium text-gray-500"
				>
					{(editing?.name ?? '?').trim().charAt(0).toUpperCase()}
				</span>
			{/if}

			<form
				bind:this={pictureForm}
				method="post"
				action="?/setPicture"
				enctype="multipart/form-data"
				use:enhance={() =>
					async ({ update }) => {
						uploadingFace = false;
						await update({ reset: false });
					}}
				class="flex flex-wrap items-center gap-2"
			>
				<input type="hidden" name="id" value={editingId} />
				<input type="hidden" name="name" value={editing?.name ?? ''} />
				<label class="btn btn-sm">
					<Icon name="image" />
					{editing?.pictureId ? t('notebooks.people.replaceThePicture') : t('pictures.add')}
					<input
						type="file"
						name="file"
						accept="image/png,image/jpeg,image/webp,image/gif"
						class="sr-only"
						onchange={(e) => {
							const field = e.currentTarget as HTMLInputElement;
							const file = field.files?.[0];
							faceProblem = '';
							if (!file) return;
							if (file.size > data.pictureKilobytes * 1024) {
								faceProblem = t('pictures.tooBig', {
									limit: data.pictureKilobytes,
									name: file.name,
									size: Math.ceil(file.size / 1024)
								});
								field.value = '';
								return;
							}
							uploadingFace = true;
							pictureForm?.requestSubmit();
						}}
					/>
				</label>
			</form>

			{#if editing?.pictureId}
				<form method="post" action="?/removePicture" use:enhance>
					<input type="hidden" name="id" value={editingId} />
					<button class="btn btn-sm btn-quiet" title={t('notebooks.people.removeThePicture')}>
						<Icon name="trash" />
						{t('ui.remove')}
					</button>
				</form>
			{/if}

			<span class="text-xs text-gray-500">
				{#if uploadingFace}{t('notebooks.people.uploading')}{:else}{t('notebooks.people.upTo')}
					{data.pictureKilobytes}{t('notebooks.people.kb')}{/if}
			</span>
		</div>
		{#if faceProblem}
			<div class="mt-2"><Banner message={faceProblem} /></div>
		{/if}
	{/if}

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (showForm = false)}>{t('ui.cancel')}</button>
		<button type="submit" form="person-form" class="btn btn-primary">
			{editingId ? t('ui.save') : t('notebooks.people.addPerson')}
		</button>
	{/snippet}
</Modal>
