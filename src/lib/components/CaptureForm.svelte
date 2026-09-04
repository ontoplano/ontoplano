<script lang="ts">
	import FormGrid from '$lib/components/FormGrid.svelte';
	import BuyFields from '$lib/components/fields/BuyFields.svelte';
	import IdeaFields from '$lib/components/fields/IdeaFields.svelte';
	import NoteFields from '$lib/components/fields/NoteFields.svelte';
	import TodoFields from '$lib/components/fields/TodoFields.svelte';
	import type { Capture } from '$lib/capture';
	import type { Rating } from '$lib/ratings';

	/**
	 * The body of a capture dialog — the same form the section's own dialog uses.
	 *
	 * There were three of these: the dashboard tiles', the header row's and the
	 * pie's, each a single input over the same action. So a field added to a
	 * page was a field capture silently did not have, in three places, and
	 * somebody with thirty seconds *and* something to say had to save the thing
	 * and open it again to add the rest.
	 *
	 * One form now, and it is the page's form: everything but the lead field is
	 * collapsed, because the reason capture exists is that it does not ask you
	 * for anything before you can write.
	 */
	let { capture }: { capture: Capture } = $props();

	/**
	 * The choices the full forms offer, fetched the first time one opens.
	 *
	 * Capture is in the shell, on every page, so loading these with the layout
	 * would run three queries per request for a dialog most visits never open.
	 * The form works without them in the meantime: an empty category list is a
	 * select with nothing in it, not a broken form.
	 */
	type Options = {
		categories: { id: number; name: string }[];
		notebooks: { id: number; title: string }[];
		shoppingCategories: { id: number; name: string }[];
	};

	let options = $state<Options>({ categories: [], notebooks: [], shoppingCategories: [] });
	let ratings = $state<Record<Rating, number | null>>({
		urgency: null,
		interest: null,
		energy: null
	});

	$effect(() => {
		// Named so the effect re-runs for each opening: nothing carries over
		// from the last thing that was written down.
		void capture.key;
		ratings = { urgency: null, interest: null, energy: null };
	});

	$effect(() => {
		if (options.categories.length || options.shoppingCategories.length) return;
		fetch('/api/capture-options')
			.then((res) => (res.ok ? res.json() : null))
			.then((loaded) => {
				if (loaded) options = loaded;
			})
			.catch(() => {});
	});
</script>

<FormGrid>
	{#if capture.key === 'idea'}
		<IdeaFields compact />
	{:else if capture.key === 'note'}
		<NoteFields compact notebooks={options.notebooks} />
	{:else if capture.key === 'todo'}
		<TodoFields
			compact
			categories={options.categories}
			notebooks={options.notebooks}
			bind:ratings
		/>
	{:else}
		<BuyFields compact categories={options.shoppingCategories} />
	{/if}
</FormGrid>
