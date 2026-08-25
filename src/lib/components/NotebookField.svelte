<script lang="ts">
	import Field from './Field.svelte';

	/**
	 * The one control that says what subject a thing belongs to.
	 *
	 * Entries, todos and goals all point at a notebook, and all three used to be
	 * a place where I could have written a slightly different select. One
	 * component means the label, the wording of "no notebook", and the ordering
	 * are the same wherever you meet it.
	 */
	let {
		notebooks,
		value = null,
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
	<Field label="Notebook" {span}>
		<select {name} class="select">
			<option value="">— none —</option>
			{#each notebooks as notebook (notebook.id)}
				<option value={notebook.id} selected={value === notebook.id}>{notebook.title}</option>
			{/each}
		</select>
	</Field>
{/if}
