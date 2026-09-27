<script lang="ts">
	import Field from './Field.svelte';
	import Picker from './Picker.svelte';
	import { notebookPath } from '$lib/notebook-path';
	import { useT } from '$lib/i18n';

	const t = useT();

	/**
	 * The one control that says what subject a thing belongs to.
	 *
	 * Entries, todos and goals all point at a notebook, and each was one more
	 * place a slightly different select could have been written. One
	 * component means the label, the wording of "no notebook", and the ordering
	 * are the same wherever you meet it.
	 */
	let {
		notebooks,
		value = $bindable(null),
		span = 6,
		name = 'notebookId',
		label = '',
		noneLabel = ''
	}: {
		/** With its folder where the caller has it, so two of one name are told apart. */
		notebooks: {
			id: number;
			title: string;
			folder?: string | null;
			favourite?: boolean;
			defaultTags?: string;
		}[];
		value?: number | null;
		span?: 3 | 4 | 6 | 8 | 12;
		name?: string;
		/** What the field is called. "Notebook" unless the caller says otherwise. */
		label?: string;
		/**
		 * What "in no notebook" is called here.
		 *
		 * Usually nothing — a thing filed nowhere is filed nowhere. A note is
		 * the exception: one in no notebook is in the diary, which is a place
		 * rather than the absence of one, and "— none —" said the opposite.
		 */
		noneLabel?: string;
	} = $props();

	/*
	 * The list as the shelf draws it: the starred ones first, under their own
	 * heading and named by their whole path, then every other notebook inside
	 * its folders. "Home — Kitchen — Countertops" as one option was a path to
	 * read; nested, the eye walks it.
	 */
	const segments = (folder: string | null | undefined) => (folder ?? '').split('/').filter(Boolean);

	/** A folder's own notebooks, then its subfolders, so every group is one run. */
	function byFolderThenTitle(
		a: { title: string; folder?: string | null },
		b: { title: string; folder?: string | null }
	): number {
		const [x, y] = [segments(a.folder), segments(b.folder)];
		for (let i = 0; i < Math.min(x.length, y.length); i += 1) {
			const by = x[i].localeCompare(y[i]);
			if (by !== 0) return by;
		}
		return x.length - y.length || a.title.localeCompare(b.title);
	}

	const options = $derived([
		{ value: '', label: noneLabel || t('ui.none') },
		...notebooks
			.filter((notebook) => notebook.favourite)
			.map((notebook) => ({
				value: String(notebook.id),
				label: notebookPath(notebook),
				path: [t('notebooks.favourites')]
			})),
		...notebooks
			.filter((notebook) => !notebook.favourite)
			.toSorted(byFolderThenTitle)
			.map((notebook) => ({
				value: String(notebook.id),
				label: notebook.title,
				path: segments(notebook.folder),
				face: notebookPath(notebook)
			}))
	]);
</script>

{#if notebooks.length > 0}
	<Field label={label || t('ui.notebook')} {span}>
		<Picker
			{name}
			value={String(value ?? '')}
			onpick={(picked) => (value = picked === '' ? null : Number(picked))}
			{options}
			label={label || t('ui.notebook')}
		/>
	</Field>
{/if}
