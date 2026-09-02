<script lang="ts">
	import Field from '$lib/components/Field.svelte';
	import MoreOptions from '$lib/components/MoreOptions.svelte';
	import PictureAttach from '$lib/components/PictureAttach.svelte';
	import { autogrow } from '$lib/actions/autogrow';

	/**
	 * What a note is made of. See IdeaFields for why this is a component.
	 *
	 * Pictures are attached here rather than on one page, because this is the
	 * one place a note is written from — the diary, a notebook, the capture
	 * wheel. Whatever a picture does in one of them it does in all of them.
	 */
	let {
		content = '',
		tags = '',
		compact = false,
		/** Off where there is no room for it, like the capture sheet's four rows. */
		pictures = true
	}: { content?: string; tags?: string; compact?: boolean; pictures?: boolean } = $props();

	let box = $state<HTMLTextAreaElement>();
</script>

<Field label="Note" span={12} required>
	<textarea
		bind:this={box}
		name="content"
		required
		rows={compact ? 4 : 8}
		use:autogrow
		class="textarea">{content}</textarea
	>
	{#if pictures}
		<PictureAttach target={box} />
	{/if}
</Field>

{#snippet rest()}
	<Field label="Tags" span={12} hint="Separate with commas or spaces. A leading # is fine.">
		<input
			name="tags"
			type="text"
			autocomplete="off"
			value={tags}
			placeholder="work, health"
			class="input"
		/>
	</Field>
{/snippet}

{#if compact}
	<MoreOptions label="Tags" count={tags ? 1 : 0}>{@render rest()}</MoreOptions>
{:else}
	{@render rest()}
{/if}
