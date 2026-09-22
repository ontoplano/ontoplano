<script lang="ts">
	import Field from './Field.svelte';
	import Picker from './Picker.svelte';
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
		name = 'notebookId'
	}: {
		notebooks: { id: number; title: string }[];
		value?: number | null;
		span?: 3 | 4 | 6 | 8 | 12;
		name?: string;
	} = $props();
</script>

{#if notebooks.length > 0}
	<Field label={t('ui.notebook')} {span}>
		<Picker
			{name}
			value={String(value ?? '')}
			onpick={(picked) => (value = picked === '' ? null : Number(picked))}
			options={[
				{ value: '', label: t('ui.none') },
				...notebooks.map((notebook) => ({
					value: String(notebook.id),
					label: notebook.title
				}))
			]}
			label={t('ui.notebook')}
		/>
	</Field>
{/if}
