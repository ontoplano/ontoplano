<script lang="ts">
	import Field from '$lib/components/Field.svelte';
	import MoreOptions from '$lib/components/MoreOptions.svelte';
	import NotebookField from '$lib/components/NotebookField.svelte';
	import RatingPicker from '$lib/components/RatingPicker.svelte';
	import { RATINGS, type Rating } from '$lib/ratings';

	/**
	 * What a todo is made of. See IdeaFields for why this is a component.
	 *
	 * The ratings were already behind a disclosure here; `compact` puts the
	 * category, notebook and notes in with them, so capture is one line to fill
	 * in and the rest one click away rather than a different, lesser form.
	 */
	let {
		title = '',
		notes = '',
		categoryId = null,
		notebookId = null,
		categories = [],
		notebooks = [],
		ratings = $bindable({ urgency: null, interest: null, energy: null }),
		compact = false
	}: {
		title?: string;
		notes?: string;
		categoryId?: number | null;
		notebookId?: number | null;
		categories?: { id: number; name: string }[];
		notebooks?: { id: number; title: string }[];
		ratings?: Record<Rating, number | null>;
		compact?: boolean;
	} = $props();

	const ratingsSet = $derived(RATINGS.filter((r) => ratings[r] !== null).length);
	const filled = $derived(
		ratingsSet + (categoryId ? 1 : 0) + (notebookId ? 1 : 0) + (notes ? 1 : 0)
	);
</script>

<Field label="Title" span={12} required>
	<input name="title" type="text" required autocomplete="off" value={title} class="input" />
</Field>

{#snippet details()}
	<Field label="Category" span={6}>
		<select name="categoryId" class="select">
			<option value="">— none —</option>
			{#each categories as cat (cat.id)}
				<option value={cat.id} selected={categoryId === cat.id}>{cat.name}</option>
			{/each}
		</select>
	</Field>

	<NotebookField {notebooks} value={notebookId} />

	<Field label="Notes" span={12}>
		<textarea name="notes" rows="3" class="textarea">{notes}</textarea>
	</Field>
{/snippet}

{#snippet scales()}
	{#each RATINGS as r (r)}
		<div class="col-span-12 sm:col-span-4">
			<RatingPicker rating={r} bind:value={ratings[r]} />
		</div>
	{/each}
{/snippet}

{#if compact}
	<MoreOptions label="Category, notes, ratings" count={filled}>
		{@render details()}
		{@render scales()}
	</MoreOptions>
{:else}
	{@render details()}
	<!-- Three optional five-point scales at the top of a create form read as
	     work to do before you may write anything down. -->
	<MoreOptions label="Urgency, interest, energy" count={ratingsSet}>
		{@render scales()}
	</MoreOptions>
{/if}
