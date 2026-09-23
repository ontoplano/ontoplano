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
	import type { PlainKey } from '$lib/i18n/keys';
	import { page } from '$app/state';
	import { useT } from '$lib/i18n';

	const t = useT();

	let {
		title = '',
		description = '',
		defaultTags = '',
		/**
		 * What this notebook can be switched on to hold, and what it holds now.
		 *
		 * Absent while one is being made: a notebook that does not exist yet has
		 * nothing filed under it and starts with notes and tasks, so asking here
		 * would be a question with no consequence anybody can see. It is on the
		 * Edit dialog, where the counts beside each row mean something.
		 */
		modules = []
	}: {
		title?: string;
		description?: string;
		defaultTags?: string;
		modules?: { id: string; name: PlainKey; always: boolean; on: boolean; held: number }[];
	} = $props();
</script>

<FormGrid>
	<Field label={t('ui.title')} span={12} required hint={t('notebooks.anEmDashMakesA')}>
		<OneLine
			name="heading"
			placeholder={t('notebooks.kitchenRenovation')}
			value={title}
			class="input"
			required
		/>
	</Field>

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
		<Field label={t('notebooks.whatItHolds')} span={12} group>
			<!-- Unticking every box posts no `modules` at all. This is what tells
			     the action the form asked. -->
			<input type="hidden" name="modulesPosted" value="1" />
			<p class="mb-2 text-xs text-gray-500">{t('notebooks.aNotebookStartsWith')}</p>
			<div class="space-y-1">
				{#each modules as module (module.id)}
					<ToggleRow
						label={t(module.name)}
						name="modules"
						value={module.id}
						on={module.on}
						always={module.always}
						note={module.held ? t('notebooks.alreadyFiled', { count: module.held }) : undefined}
					/>
				{/each}
			</div>
		</Field>
	{/if}
</FormGrid>
