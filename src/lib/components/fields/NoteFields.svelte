<script lang="ts">
	import Field from '$lib/components/Field.svelte';
	import MoreOptions from '$lib/components/MoreOptions.svelte';
	import { autogrow } from '$lib/actions/autogrow';

	/**
	 * What a note is made of. See IdeaFields for why this is a component.
	 */
	let {
		content = '',
		tags = '',
		compact = false
	}: { content?: string; tags?: string; compact?: boolean } = $props();
</script>

<Field label="Note" span={12} required>
	<textarea name="content" required rows={compact ? 4 : 8} use:autogrow class="textarea"
		>{content}</textarea
	>
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
