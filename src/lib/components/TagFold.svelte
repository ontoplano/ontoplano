<script lang="ts">
	/**
	 * Every tag in a room, as a filter that folds away.
	 *
	 * A wall of chips above everything is what a room that gathers tags looks
	 * like after a month of use — and a diary or a list of ideas gathers them
	 * faster than anything else here. It is a filter, which is something you go
	 * looking for; what the page is about is underneath it. So it starts folded,
	 * behind a heading that says how many there are.
	 *
	 * The one it is filtered by stays on screen while the rest are folded, or
	 * closing the list would hide that a filter is on at all.
	 *
	 * The Ideas room had this and the diary beside it had a loose row of every
	 * tag on the page's own ground; one component, so the two cannot answer the
	 * same question differently again.
	 */
	import Icon from '$lib/components/Icon.svelte';
	import TagChip from '$lib/components/TagChip.svelte';
	import { useT } from '$lib/i18n';

	const t = useT();

	let {
		tags,
		/** The tag in force, or null. Bound: pressing a chip is choosing one. */
		selected = $bindable<string | null>(null),
		/** Called whenever the filter changes, for whatever else follows it. */
		onchange
	}: {
		tags: { id: number; name: string }[];
		selected?: string | null;
		onchange?: () => void;
	} = $props();

	let open = $state(false);

	function choose(name: string | null) {
		selected = name;
		onchange?.();
	}
</script>

{#if tags.length > 0}
	<div class="space-y-2">
		<button
			type="button"
			onclick={() => (open = !open)}
			class="flex items-center gap-1.5 text-xs font-medium tracking-wide text-gray-500 uppercase hover:text-gray-900"
			aria-expanded={open}
		>
			<Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} />
			{t('ui.tags')}
			<span class="text-gray-500">({tags.length})</span>
		</button>

		{#if open}
			<div class="flex flex-wrap gap-2">
				{#each tags as tag (tag.id)}
					<TagChip
						name={tag.name}
						active={selected === tag.name}
						onclick={() => choose(selected === tag.name ? null : tag.name)}
					/>
				{/each}
				{#if selected}
					<button onclick={() => choose(null)} class="chip text-gray-500 hover:text-gray-600">
						{t('ui.clear')}
					</button>
				{/if}
			</div>
		{:else if selected}
			<div class="flex flex-wrap items-center gap-2">
				<TagChip name={selected} active />
				<button onclick={() => choose(null)} class="chip text-gray-500 hover:text-gray-600">
					{t('ui.clear')}
				</button>
			</div>
		{/if}
	</div>
{/if}
