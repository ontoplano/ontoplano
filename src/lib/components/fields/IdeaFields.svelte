<script lang="ts">
	import Field from '$lib/components/Field.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import MoreOptions from '$lib/components/MoreOptions.svelte';
	import RecordingAttach from '$lib/components/RecordingAttach.svelte';
	import { useT } from '$lib/i18n';

	const t = useT();

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

	let box = $state<HTMLTextAreaElement>();
</script>

<Field label={t('fields.idea.heading')} span={12} required>
	<textarea bind:this={box} name="content" required rows={compact ? 4 : 5} class="textarea"
		>{content}</textarea
	>
	<!-- An idea said out loud is still an idea. The same attachment the note
	     form has, for the same reason: some of them are quicker to say. -->
	<RecordingAttach target={box} />
</Field>

{#snippet rest()}
	<Field label={t('ui.tags')} span={12} hint={t('fields.idea.separateWithCommasOrSpaces')}>
		<OneLine name="tags" placeholder={t('fields.idea.tagsExample')} value={tags} class="input" />
	</Field>
{/snippet}

{#if compact}
	<MoreOptions label={t('ui.tags')} count={tags ? 1 : 0}>{@render rest()}</MoreOptions>
{:else}
	{@render rest()}
{/if}
