<script lang="ts">
	/**
	 * What a notebook is made of. See IdeaFields for why this is a component.
	 *
	 * Two dialogues edit a notebook — the one on the list and the one on the
	 * notebook's own page — and they had drifted: the page's had grown the
	 * labels a new note starts with and the list's had not, so the same Edit
	 * notebook offered two different things depending on where you pressed it.
	 * One component, so a field added here is on both.
	 */
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import TagInput from '$lib/components/TagInput.svelte';
	import ToggleRow from '$lib/components/ToggleRow.svelte';
	import NotebookPicture from '$lib/components/NotebookPicture.svelte';
	import { untrack } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { moduleChoicesOf, type NotebookModule } from '$lib/notebook-modules';
	import NotebookField from '$lib/components/NotebookField.svelte';
	import { isInsideNotebook, leafNotebookName, parentNotebookPath } from '$lib/notebook-path';
	import { page } from '$app/state';
	import { useT } from '$lib/i18n';

	const t = useT();

	let {
		title = '',
		description = '',
		defaultTags = '',
		/**
		 * The notebook being edited, when one exists.
		 *
		 * Absent while one is being made: a notebook that does not exist yet has
		 * nothing filed under it and starts with notes and tasks, so asking what
		 * it holds would be a question with no consequence anybody can see. It
		 * is on the Edit dialog, where the counts beside each row mean
		 * something.
		 *
		 * The choices are worked out here rather than loaded, so that both
		 * dialogs — the one on the list and the one on the notebook's own page —
		 * offer the same fields. They did not: only one route had asked the
		 * server for them.
		 */
		notebook = null,
		/** What the browser refuses before sending. The page knows the ceiling. */
		pictureKilobytes = 0,
		/**
		 * The notebooks this one could go inside — the whole shelf.
		 *
		 * Empty where the caller has none to offer, and the field draws nothing.
		 */
		notebooks = []
	}: {
		title?: string;
		description?: string;
		defaultTags?: string;
		notebook?: {
			id: number;
			title: string;
			mine?: boolean;
			pictureId: number | null;
			modules: readonly NotebookModule[];
			counts: Record<NotebookModule, number>;
		} | null;
		pictureKilobytes?: number;
		notebooks?: { id: number; title: string }[];
	} = $props();

	/*
	 * The name, and the notebook it sits inside, as two fields.
	 *
	 * A notebook's place is its name — `Renovation — Kitchen` sits inside
	 * `Renovation` — and that is what makes renaming one the way to move it.
	 * It also meant the only way to file a new notebook under another was to
	 * know to type an em dash, which nobody does. The box holds the name; this
	 * holds the place; the server joins them.
	 */
	let inside = $state<number | null>(null);
	let seededFrom = title;
	const parentOf = (full: string) => {
		const path = parentNotebookPath(full);
		return path ? (notebooks.find((one) => one.title === path)?.id ?? null) : null;
	};
	$effect(() => {
		if (title === seededFrom) return;
		seededFrom = title;
		inside = parentOf(title);
	});

	/*
	 * Everything except itself and what is already under it: a notebook inside
	 * its own child is a name that contains itself and a tree with no bottom.
	 */
	const couldHold = $derived(
		notebooks.filter((one) => !notebook || !isInsideNotebook(one.title, notebook.title))
	);

	const offered = $derived(
		notebook ? moduleChoicesOf(notebook, page.data.hiddenSections ?? []) : []
	);

	/*
	 * The order the tabs come in, which is the notebook's to set.
	 *
	 * Held here rather than posted as a field of its own: the checkboxes post
	 * in the order they stand in the page, so moving a row *is* the answer —
	 * `formData.getAll('modules')` arrives in this order and the service keeps
	 * it. Seeded from the notebook and re-seeded when a different one is
	 * opened, the same shape `Picker` and `TagInput` use.
	 */
	let order = $state<string[]>(untrack(() => offered.map((one) => one.id)));
	let seededFor = untrack(() => notebook?.id ?? null);
	$effect(() => {
		if ((notebook?.id ?? null) === seededFor) return;
		seededFor = notebook?.id ?? null;
		order = offered.map((one) => one.id);
	});

	const modules = $derived([...offered].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)));

	/** The last row that has a place in the order: an off one has no tab. */
	const lastOn = $derived(modules.map((one) => one.on).lastIndexOf(true));

	function shift(id: string, by: number) {
		const at = order.indexOf(id);
		const to = at + by;
		if (at < 0 || to < 0 || to >= order.length) return;
		const next = [...order];
		[next[at], next[to]] = [next[to], next[at]];
		order = next;
	}
</script>

<FormGrid>
	<!--
		The cover beside the name it belongs to.

		It was a block bolted on under the form with a line explaining what it
		was for, which is a caption for something nobody needed explaining: a
		picture next to a title is a cover. It goes up on its own the moment it
		is chosen — a multipart send, not the same submission as the words —
		which is why it sits beside the field rather than inside the form.
	-->
	<div class="col-span-12 flex items-end gap-3">
		{#if notebook && notebook.mine !== false}
			<NotebookPicture {notebook} kilobytes={pictureKilobytes} size="size-20" removable />
		{/if}
		<div class="min-w-0 flex-1">
			<Field label={t('ui.title')} span={12} required>
				<OneLine
					name="heading"
					placeholder={t('notebooks.kitchenRenovation')}
					value={leafNotebookName(title)}
					class="input"
					required
				/>
			</Field>
		</div>
	</div>

	<!-- Where it goes. `NotebookField` is the same control that files a note or
	     a task under a subject, asking the same question about a notebook. -->
	<NotebookField
		notebooks={couldHold}
		bind:value={inside}
		span={12}
		name="parent"
		label={t('notebooks.inside')}
	/>

	<Field label={t('notebooks.whatItIsFor')} span={12}>
		<textarea name="description" rows="3" class="textarea">{description}</textarea>
	</Field>

	<!-- What writing about this subject usually carries, so nobody types it on
	     every note. Filled into the note form, not applied behind it — see
	     NoteFields. -->
	<Field label={t('ui.tags')} span={12} hint={t('notebooks.id.everyNewNoteStartsWith')}>
		<TagInput name="defaultTags" value={defaultTags} known={page.data.tagVocabulary ?? []} />
	</Field>

	<!--
		What this subject accumulates, beside what is written about it.

		The same control Preferences uses for the rooms, for the same question —
		see `ToggleRow`. A module switched off keeps whatever is filed under it,
		which is why the count is on the row: turning Inventory off is one tab
		fewer, not four things deleted.

		A group rather than an ordinary field, because a `Field` is a `<label>`
		and one wrapping nine checkboxes lends its whole text to each of them.
	-->
	{#if modules.length > 0}
		<Field label={t('notebooks.tabs')} span={12} group>
			<!-- Unticking every box posts no `modules` at all. This is what tells
			     the action the form asked. -->
			<input type="hidden" name="modulesPosted" value="1" />
			<p class="mb-2 text-xs text-gray-500">{t('notebooks.aNotebookStartsWith')}</p>
			<!-- The arrows set the order of the tabs, and the boxes post in the
			     order they stand in — so moving a row is the whole answer. -->
			<div class="space-y-1">
				{#each modules as module, at (module.id)}
					<ToggleRow
						label={t(module.name)}
						name="modules"
						value={module.id}
						on={module.on}
						always={module.always}
						note={module.held ? t('notebooks.alreadyFiled', { count: module.held }) : undefined}
					>
						{#snippet leading()}
							<!--
								A module that is always on has no checkbox to post, so it had
								no place in the order either: moving Notes sent it to the end,
								because the only thing that came back from the form was the
								boxes. This is its place in the list, said out loud.
							-->
							{#if module.always}
								<input type="hidden" name="modules" value={module.id} />
							{/if}

							<!-- A number only where there is a place: a module that is off
							     has no tab and so no position in the strip. -->
							<span class="tabular w-5 shrink-0 text-xs text-gray-500">
								{module.on ? at + 1 : ''}
							</span>
						{/snippet}

						{#snippet trailing()}
							{#if module.on}
								<button
									type="button"
									onclick={() => shift(module.id, -1)}
									disabled={at === 0}
									class="p-1 text-gray-500 hover:text-gray-900 disabled:opacity-30"
									title={t('settings.preferences.moveUp')}
									aria-label={t('settings.menu.moveUp', { what: t(module.name) })}
								>
									<Icon name="chevron-up" size={16} />
								</button>
								<button
									type="button"
									onclick={() => shift(module.id, 1)}
									disabled={at === lastOn}
									class="p-1 text-gray-500 hover:text-gray-900 disabled:opacity-30"
									title={t('settings.preferences.moveDown')}
									aria-label={t('settings.menu.moveDown', { what: t(module.name) })}
								>
									<Icon name="chevron-down" size={16} />
								</button>
							{/if}
						{/snippet}
					</ToggleRow>
				{/each}
			</div>
		</Field>
	{/if}
</FormGrid>
