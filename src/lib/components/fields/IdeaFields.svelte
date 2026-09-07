<script lang="ts">
	import Field from '$lib/components/Field.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import MoreOptions from '$lib/components/MoreOptions.svelte';

	/**
	 * What an idea is made of.
	 *
	 * One definition, two places: the Ideas page's dialog and the capture pie.
	 * They were two forms over the same action, the capture one holding a single
	 * input — so a field added to the page was a field capture silently did not
	 * have, and somebody with thirty seconds and something to say had to save
	 * and reopen the thing to add the rest.
	 *
	 * `compact` is the capture shape: the lead field, and everything else behind
	 * a disclosure. Same fields, same names, one of them.
	 */
	let {
		content = '',
		tags = '',
		compact = false
	}: { content?: string; tags?: string; compact?: boolean } = $props();
</script>

<Field label="Idea" span={12} required>
	<textarea name="content" required rows={compact ? 4 : 5} class="textarea">{content}</textarea>
</Field>

{#snippet rest()}
	<Field label="Tags" span={12} hint="Separate with commas or spaces. A leading # is fine.">
		<OneLine name="tags" placeholder="project, app, music" value={tags} class="input" />
	</Field>
{/snippet}

{#if compact}
	<MoreOptions label="Tags" count={tags ? 1 : 0}>{@render rest()}</MoreOptions>
{:else}
	{@render rest()}
{/if}
