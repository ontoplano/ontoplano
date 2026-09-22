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
	import { renderMarkdown, type TodoRefs } from '$lib/markdown';
	import { useT } from '$lib/i18n';

	const t = useT();

	/**
	 * A piece of writing as it was typed, with anything attached to it drawn.
	 *
	 * Markdown, everywhere writing is shown. An idea, a todo's notes and a note
	 * about somebody used to be drawn as plain text on the grounds that they
	 * are a sentence rather than a document — and the app then had two answers
	 * to the same question: a fenced block rendered in a notebook and came out
	 * as three backticks on a task, `TASK:#4` was a link in one place and four
	 * characters in the other. Somebody writing in this app writes markdown;
	 * where it is shown is not the place to decide it is not.
	 *
	 * A recording and a picture are both stored as ordinary markdown, which is
	 * right for the text and wrong on the screen: what somebody sees otherwise
	 * is `[my great idea, in audio](/media/audio/40)` and `![screenshot](/media/12)`
	 * sitting in the middle of their own writing. Both come out of the text
	 * before it is rendered and are drawn under it — the thing itself rather
	 * than the address of it.
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
		/**
		 * The tasks this writing may point at, so `TASK:#4` is a link with the
		 * task's own title on it rather than four characters. Passed where the
		 * caller has them; without it the reference is still a link, just
		 * unnamed — which is what an export or a half-loaded page should show.
		 */
		todos = undefined,
		class: klass = ''
	}: {
		content: string;
		compact?: boolean;
		oneLine?: boolean;
		inheritInk?: boolean;
		todos?: TodoRefs;
		class?: string;
	} = $props();

	const spoken = $derived(splitAudio(content));
	const shown = $derived(splitPictures(spoken.text));

	/**
	 * Unfolded by a press on one of its own pictures, rather than by the row.
	 *
	 * A picture under a clamped line sits beneath writing nobody has read yet,
	 * and a tab opened from there takes somebody away from the line they were
	 * about to read. So the first press unfolds and the second opens. It is
	 * dropped as soon as the owner has the row open, so the owner's fold is
	 * the one that counts again when it closes.
	 */
	let revealed = $state(false);
	$effect(() => {
		if (!oneLine) revealed = false;
	});

	const folded = $derived(oneLine && !revealed);
	/** With nothing written over it a picture has nothing to unfold, so it opens at once. */
	const unfoldsFirst = $derived(folded && Boolean(shown.text));

	/** The picture that was pressed, so the keyboard lands back on it as a link. */
	let landOn: number | null = null;

	function unfold(id: number) {
		landOn = id;
		revealed = true;
	}

	const height = $derived(folded ? PICTURE_HEIGHT.compact : PICTURE_HEIGHT.full);
	const size = $derived(compact ? 'text-xs' : 'text-sm');
	const ink = $derived(inheritInk ? 'opacity-90' : compact ? 'text-gray-500' : 'text-gray-900');
	const type = $derived(`${size} ${ink}`);

	/*
	 * `renderMarkdown` escapes every character of the input before it emits a
	 * tag, and the only attributes it writes are its own — the same bargain the
	 * diary and the weekly review already make with `{@html}`.
	 */
	const html = $derived(renderMarkdown(shown.text, todos));
</script>

{#if shown.text}
	<!--
		Clamped rather than truncated when it is one line: the text is elements
		now, and `truncate` only cuts a single run of text. One line of a
		paragraph, and the row opens to the rest.
	-->
	<div class="md written {folded ? 'written-one-line' : ''} {type} {klass}">
		<!-- `renderMarkdown` escapes every character of the input before it emits
		     a tag, and the only attributes it writes are its own. Same bargain as
		     the diary and the weekly review. -->
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html html}
	</div>
{/if}

<!--
	A picture opens in a tab rather than a viewer of ours.

	Pinch, rotate, save, share: the browser's own picture view already does all
	of it, on every platform, and better than a lightbox we would have to build
	and then maintain a focus trap for.

	Folded, it is not a link at all but the control that unfolds the row — the
	writing the picture belongs to comes first. A span rather than a button so
	the press carries on up to whoever folded this and their own fold opens
	with it; standing alone, `unfold` is enough on its own.
-->
{#snippet thumbnail(id: number)}
	<img src="{resolve('/media')}/{id}" alt="" loading="lazy" style="max-height: {height}" />
{/snippet}

{#if shown.pictures.length > 0}
	<div class="mt-1 flex flex-wrap gap-2">
		{#each shown.pictures as id (id)}
			{#if unfoldsFirst}
				<span
					role="button"
					tabindex="0"
					aria-expanded="false"
					aria-label={t('written.showTheRest')}
					title={t('written.showTheRest')}
					class="written-picture cursor-pointer"
					onclick={() => unfold(id)}
					onkeydown={(press) => {
						if (press.key !== 'Enter' && press.key !== ' ') return;
						press.preventDefault();
						unfold(id);
					}}
				>
					{@render thumbnail(id)}
				</span>
			{:else}
				<a
					href="{resolve('/media')}/{id}"
					target="_blank"
					rel="noopener"
					class="written-picture"
					aria-label={t('written.openThePicture')}
					{@attach (node) => {
						if (landOn !== id) return;
						landOn = null;
						node.focus();
					}}
				>
					{@render thumbnail(id)}
				</a>
			{/if}
		{/each}
	</div>
{/if}

{#each spoken.audios as id (id)}
	<AudioPlayer src="{AUDIO_HREF}/{id}" class="mt-2 max-w-72" />
{/each}

<style>
	/*
	 * One line, whatever the markup inside it turns out to be.
	 *
	 * `truncate` is `text-overflow: ellipsis` on one box, which does nothing
	 * once the writing is a paragraph and a list rather than a string. The
	 * clamp is on the whole block, and everything after the first line —
	 * another paragraph, a table, a picture the renderer drew — is simply not
	 * drawn until the row is opened.
	 */
	.written-one-line {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 1;
		line-clamp: 1;
		overflow: hidden;
	}

	/* A row is not a document: the renderer's block spacing is too loud here. */
	.written :global(p + p),
	.written :global(ul),
	.written :global(ol),
	.written :global(pre),
	.written :global(blockquote) {
		margin-top: 0.375rem;
	}

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
