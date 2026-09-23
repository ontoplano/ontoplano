<script lang="ts">
	import { enhance } from '$lib/enhance';
	import { armed } from '$lib/actions/armed';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import Select from '$lib/components/Select.svelte';
	import { MODULE_SPECS, type ModuleField } from '$lib/notebook-tabs';
	import { rowsFor } from '$lib/notebook-rows';
	import type { NotebookModule } from '$lib/notebook-modules';
	import type { Currency } from '$lib/money';
	import { useT } from '$lib/i18n';

	const t = useT();

	/**
	 * One module's rows inside a notebook, with the module's own work on them.
	 *
	 * Seven modules, one list: what differs between them is described in
	 * `$lib/notebook-tabs` and `$lib/notebook-rows`, so the row heights, the
	 * paddings, where the buttons sit and what an editor looks like are decided
	 * here once. A tab that reimplemented its room would be a second screen to
	 * keep in step; a tab that only linked to its room would be a bookmark.
	 *
	 * Everything posts to the notebook page, which mounts each room's own
	 * handlers under the module's prefix — see `$lib/module-actions`. So the
	 * button that ticks a habit here runs the code the Health room runs.
	 */
	let {
		module,
		notebookId,
		contents,
		currency,
		inventoryCategories = [],
		workoutCategories = [],
		/** What the last submission said, if it failed. See `Modal`'s `error`. */
		formMessage = null,
		/** Opened from the page's New button, which follows whichever tab is up. */
		composing = $bindable(false)
	}: {
		module: NotebookModule;
		notebookId: number;
		contents: Record<string, unknown[]> | null;
		currency: Currency;
		inventoryCategories?: { id: number; name: string }[];
		workoutCategories?: { id: number; name: string }[];
		formMessage?: string | null;
		composing?: boolean;
	} = $props();

	const spec = $derived(MODULE_SPECS[module]!);
	const rows = $derived(rowsFor(module, contents, { t, currency }));

	/** The raw row behind a line, for filling the editor in. */
	function raw(id: number): Record<string, unknown> {
		return ((contents?.[module] ?? []) as Record<string, unknown>[]).find(
			(row) => Number(row.id) === id
		) as Record<string, unknown>;
	}

	let editingId = $state<number | null>(null);
	let confirmingDeleteId = $state<number | null>(null);

	/** Which list a `from:` field draws its options from. */
	function optionsOf(field: ModuleField): { id: number; name: string }[] {
		if (field.kind !== 'select' || !field.from) return [];
		return field.from === 'inventoryCategories' ? inventoryCategories : workoutCategories;
	}

	/**
	 * What a field starts with when the editor opens on an existing row.
	 *
	 * The row's own value where the names line up, and blank otherwise — a
	 * form field named `heading` reads `title` on a recipe and `name` on a
	 * bill, which is the rooms' own vocabulary and not worth renaming columns
	 * over.
	 */
	const ALIASES: Record<string, string[]> = {
		heading: ['title', 'name'],
		label: ['name', 'title'],
		content: ['content'],
		amount: ['amountExpected'],
		price: ['priceCents'],
		tags: []
	};

	function valueOf(field: ModuleField, row: Record<string, unknown> | undefined): string {
		for (const key of [field.name, ...(ALIASES[field.name] ?? [])]) {
			const found = row?.[key];
			if (found !== undefined && found !== null && found !== '') return String(found);
		}
		/*
		 * A dropdown with a fixed list and no "none" has to start on something.
		 *
		 * `Select` binds its value, so handing it a blank leaves the control
		 * showing its first option while posting nothing — and the room refuses
		 * the empty string, which is a save that fails with the form looking
		 * perfectly filled in. The first option is what the browser would have
		 * chosen anyway; this makes the form say so.
		 */
		if (field.kind === 'select' && !field.blank && field.options?.length)
			return field.options[0].value;
		return '';
	}

	/** Tags arrive as rows and go back as words, the way every tag field does. */
	function tagsOf(row: Record<string, unknown> | undefined): string {
		const tags = row?.tags as { name: string }[] | undefined;
		return tags?.map((tag) => tag.name).join(', ') ?? '';
	}

	/** Money is stored in the smallest unit and typed in the ordinary one. */
	function moneyOf(field: ModuleField, row: Record<string, unknown> | undefined): string {
		const cents = Number(valueOf(field, row));
		return Number.isFinite(cents) && cents !== 0 ? String(cents / 100) : '';
	}

	function closeEditor() {
		editingId = null;
		composing = false;
	}

	/** The small icon buttons on a row, sized and spaced the same. */
	const ICON_LINK = 'shrink-0 p-1 text-gray-500 hover:text-gray-900';

	const openLabel = $derived(t('notebooks.openInItsRoom'));

	/** The editor is open for a new row, or for one that exists. */
	const open = $derived(composing || editingId !== null);
	const editingRow = $derived(editingId === null ? undefined : raw(editingId));
</script>

{#if rows.length === 0}
	<EmptyState icon="notebook" title={t(spec.empty)} compact />
{:else}
	<ul class="divide-y divide-gray-100">
		{#each rows as row (row.id)}
			{@const source = raw(row.id)}
			<li class="flex items-center gap-3 px-1 py-2">
				{#if spec.mark}
					<!--
						The one verb the tab is for, first on the row and reachable
						with a thumb. A form rather than a button with a handler, so
						it works before any script has run.
					-->
					<form
						method="post"
						action={spec.mark.action}
						use:enhance={() =>
							async ({ update }) => {
								await update({ reset: false });
							}}
					>
						<input type="hidden" name="id" value={row.id} />
						<input type="hidden" name="habitId" value={row.id} />
						<button
							class="btn btn-sm shrink-0"
							aria-pressed={row.done}
							title={t(row.done && spec.mark.undo ? spec.mark.undo : spec.mark.label)}
							aria-label={t(row.done && spec.mark.undo ? spec.mark.undo : spec.mark.label)}
						>
							<Icon name={spec.mark.icon} />
						</button>
					</form>
				{/if}

				<div class="min-w-0 flex-1">
					<p
						class="truncate text-sm {row.done
							? 'text-gray-500 line-through'
							: 'font-medium text-gray-900'}"
					>
						{row.title}
					</p>
					{#if row.meta.length > 0}
						<p class="truncate text-xs text-gray-500">{row.meta.join(' · ')}</p>
					{/if}
				</div>

				<!--
					Where it lives, for everything this tab deliberately does not do:
					a ledger's statement, a recipe's method, a habit's year. Already
					resolved — `$lib/notebook-tabs` builds it with `resolve()`.
				-->
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a href={spec.room(row)} class={ICON_LINK} title={openLabel} aria-label={openLabel}>
					<Icon name="arrow-right" size={16} />
				</a>

				<button
					type="button"
					onclick={() => (editingId = row.id)}
					class="shrink-0 p-1 text-gray-500 hover:text-gray-900"
					title={t('ui.edit')}
					aria-label={t('ui.edit')}
				>
					<Icon name="edit" size={16} />
				</button>

				{#if spec.archive}
					<form method="post" action={spec.archive.action} use:enhance>
						<input type="hidden" name="id" value={row.id} />
						<input
							type="hidden"
							name={spec.archive.field}
							value={source?.archived || source?.archivedAt ? 'false' : 'true'}
						/>
						<button class={ICON_LINK} title={t('ui.archive')} aria-label={t('ui.archive')}>
							<Icon name="archive" size={16} />
						</button>
					</form>
				{/if}

				{#if spec.remove}
					<button
						type="button"
						onclick={() => (confirmingDeleteId = row.id)}
						class="shrink-0 p-1 text-gray-500 hover:text-red-700"
						title={t('ui.delete')}
						aria-label={t('ui.delete')}
					>
						<Icon name="trash" size={16} />
					</button>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<!--
	One editor for both, because they are the same form: a new row is an empty
	one. Two dialogs would be two sets of fields to keep in step, which is the
	drift this whole file exists to avoid.
-->
<Modal
	{open}
	onclose={closeEditor}
	error={formMessage}
	title={editingId === null ? t(spec.newLabel) : t('ui.edit')}
>
	<form
		id="module-form"
		method="post"
		action={editingId === null ? spec.create : spec.update}
		use:enhance={() =>
			async ({ update, result }) => {
				await update({ reset: false });
				if (result.type === 'success' || result.type === 'redirect') closeEditor();
			}}
	>
		{#if editingId !== null}
			<input type="hidden" name="id" value={editingId} />
		{/if}
		<!-- What files it under this subject. Posted on edits too, so saving a
		     row from in here never takes it out of the notebook. -->
		<input type="hidden" name="notebookId" value={notebookId} />
		<!-- Where to come back to, for the actions that redirect. -->
		<input type="hidden" name="back" value={`/notebooks/${notebookId}`} />

		<FormGrid>
			{#each spec.fields as field (field.name)}
				<Field
					label={t(field.label)}
					span={field.kind === 'textarea' ? 12 : (field.span ?? 12)}
					required={field.kind === 'text' && field.required === true}
				>
					{#if field.kind === 'textarea'}
						<textarea name={field.name} rows={field.rows ?? 3} class="textarea"
							>{field.name === 'tags' ? tagsOf(editingRow) : valueOf(field, editingRow)}</textarea
						>
					{:else if field.kind === 'select'}
						<Select name={field.name} value={valueOf(field, editingRow)}>
							{#if field.blank}
								<option value="">{t(field.blank)}</option>
							{/if}
							{#each field.options ?? [] as option (option.value)}
								<option value={option.value}>{t(option.label)}</option>
							{/each}
							{#each optionsOf(field) as option (option.id)}
								<option value={option.id}>{option.name}</option>
							{/each}
						</Select>
					{:else if field.kind === 'number'}
						<input
							type="number"
							name={field.name}
							value={valueOf(field, editingRow)}
							min={field.min}
							max={field.max}
							class="input"
						/>
					{:else if field.kind === 'money'}
						<input
							type="text"
							inputmode="decimal"
							name={field.name}
							value={moneyOf(field, editingRow)}
							class="input"
						/>
					{:else}
						<OneLine
							name={field.name}
							value={field.name === 'tags' ? tagsOf(editingRow) : valueOf(field, editingRow)}
							class="input"
							required={field.required === true}
						/>
					{/if}
				</Field>
			{/each}
		</FormGrid>
	</form>

	{#snippet footer()}
		<button type="button" class="btn" onclick={closeEditor}>{t('ui.cancel')}</button>
		<button type="submit" form="module-form" class="btn btn-primary">{t('ui.save')}</button>
	{/snippet}
</Modal>

<Modal
	open={confirmingDeleteId !== null}
	onclose={() => (confirmingDeleteId = null)}
	title={t('ui.delete')}
	size="sm"
>
	<p class="text-sm text-gray-600">{t('notebooks.thisIsGoneFromEverywhere')}</p>

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (confirmingDeleteId = null)}
			>{t('ui.cancel')}</button
		>
		<form
			method="post"
			action={spec.remove}
			use:enhance={() =>
				async ({ update }) => {
					await update({ reset: false });
					confirmingDeleteId = null;
				}}
		>
			<input type="hidden" name="id" value={confirmingDeleteId} />
			<button class="btn btn-danger" use:armed>{t('ui.delete')}</button>
		</form>
	{/snippet}
</Modal>
