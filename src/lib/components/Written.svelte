<script lang="ts">
	import AudioPlayer from '$lib/components/AudioPlayer.svelte';
	import { AUDIO_HREF, splitAudio } from '$lib/audio-markdown';

	/**
	 * A piece of writing as it was typed, with any recording in it as a player.
	 *
	 * An idea and a note about somebody are drawn as plain text rather than
	 * through the markdown renderer — they are a sentence, not a document. A
	 * recording is stored as an ordinary markdown link, which is right for the
	 * text and wrong on the screen: what somebody sees is
	 * `[my great idea, in audio](/media/audio/40)` in the middle of their own
	 * writing. The link comes out and the recording is drawn under it, which is
	 * the thing itself rather than the address of it.
	 */
	let { content, class: klass = '' }: { content: string; class?: string } = $props();

	const spoken = $derived(splitAudio(content));
</script>

{#if spoken.text}
	<p class="text-sm whitespace-pre-wrap text-gray-900 {klass}">{spoken.text}</p>
{/if}
{#each spoken.audios as id (id)}
	<AudioPlayer src="{AUDIO_HREF}/{id}" class="mt-2" />
{/each}
