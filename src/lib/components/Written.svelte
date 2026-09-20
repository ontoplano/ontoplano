<script lang="ts" module>
	/**
	 * How tall a picture is allowed to be where it is not the subject.
	 *
	 * `full` is a note-sized picture: big enough to look at without opening it.
	 * `compact` is a row in a list, where the picture is a reminder that there
	 * is one rather than something anybody reads — a phone screenshot at full
	 * height would be taller than every other row on the page put together.
	 */
	const PICTURE_HEIGHT = { full: '16rem', compact: '3.5rem' } as const;
</script>

<script lang="ts">
	import AudioPlayer from '$lib/components/AudioPlayer.svelte';
	import { resolve } from '$app/paths';
	import { AUDIO_HREF, splitAudio } from '$lib/audio-markdown';
	import { splitPictures } from '$lib/picture-markdown';

	/**
	 * A piece of writing as it was typed, with anything attached to it drawn.
	 *
	 * An idea, a todo's notes and a note about somebody are drawn as plain text
	 * rather than through the markdown renderer — they are a sentence, not a
	 * document. A recording and a picture are both stored as ordinary markdown,
	 * which is right for the text and wrong on the screen: what somebody sees
	 * otherwise is `[my great idea, in audio](/media/audio/40)` and
	 * `![screenshot](/media/12)` sitting in the middle of their own writing.
	 * Both come out of the text and are drawn under it — the thing itself
	 * rather than the address of it.
	 */
	let {
		content,
		/**
		 * A row in a list: quieter type, and pictures the size of a stamp.
		 *
		 * Separate from `oneLine` because a row that has been unfolded to be
		 * read is still a row — it should wrap rather than truncate, and it
		 * should not suddenly be as loud as the title above it.
		 */
		compact = false,
		/** Cut to a single line. What a list shows until somebody asks for more. */
		oneLine = false,
		/**
		 * Take the colour of whatever this sits on, rather than the palette's
		 * grey. For a ground the palette does not know about — a board card
		 * wears its category's colour, and grey on teal is grey on teal.
		 */
		inheritInk = false,
		class: klass = ''
	}: {
		content: string;
		compact?: boolean;
		oneLine?: boolean;
		inheritInk?: boolean;
		class?: string;
	} = $props();

	const spoken = $derived(splitAudio(content));
	const shown = $derived(splitPictures(spoken.text));
	const height = $derived(oneLine ? PICTURE_HEIGHT.compact : PICTURE_HEIGHT.full);
	const size = $derived(compact ? 'text-xs' : 'text-sm');
	const ink = $derived(inheritInk ? 'opacity-90' : compact ? 'text-gray-500' : 'text-gray-900');
	const type = $derived(`${size} ${ink}`);
</script>

{#if shown.text}
	<p class="{oneLine ? 'truncate' : 'whitespace-pre-wrap'} {type} {klass}">{shown.text}</p>
{/if}

<!--
	A picture opens in a tab rather than a viewer of ours.

	Pinch, rotate, save, share: the browser's own picture view already does all
	of it, on every platform, and better than a lightbox we would have to build
	and then maintain a focus trap for.
-->
{#if shown.pictures.length > 0}
	<div class="mt-1 flex flex-wrap gap-2">
		{#each shown.pictures as id (id)}
			<a href="{resolve('/media')}/{id}" target="_blank" rel="noopener" class="written-picture">
				<img src="{resolve('/media')}/{id}" alt="" loading="lazy" style="max-height: {height}" />
			</a>
		{/each}
	</div>
{/if}

{#each spoken.audios as id (id)}
	<AudioPlayer src="{AUDIO_HREF}/{id}" class="mt-2 max-w-72" />
{/each}

<style>
	/*
	 * The white ground is the same bargain `.md img.md-image` makes: a PNG with
	 * transparency is drawn on whatever is behind it, and in the dark theme
	 * that is a dark page, which turns black line art into nothing at all.
	 */
	.written-picture img {
		display: block;
		max-width: 100%;
		width: auto;
		height: auto;
		border: 1px solid var(--color-gray-200);
		border-radius: var(--radius-md, 0);
		background: #ffffff;
	}
</style>
