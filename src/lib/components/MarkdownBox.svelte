<script lang="ts">
	/**
	 * A box for markdown, with the thing it will look like beside it.
	 *
	 * Writing markdown into a plain textarea means guessing: whether the list
	 * is a list, whether the picture resolves, whether the heading is a heading
	 * — and the only way to find out was to save and look, which is a round
	 * trip for a question about the thing on screen. So the preview is here,
	 * and it has nothing to do with saving: it is what the words already are.
	 *
	 * Two shapes, chosen by how much room the box itself has rather than by how
	 * wide the window is. Both are on screen at once where there is space for
	 * two columns, which is what "show me how this will look as I type" asks
	 * for; where there is not — a phone, or this same field inside a modal on a
	 * desktop — it is Write and Preview and you choose. A viewport query got
	 * this wrong in exactly the second case: a wide window says nothing about a
	 * narrow dialog sitting in the middle of it.
	 *
	 * Both panes keep their place either way, so choosing does not move the
	 * page under the press.
	 *
	 * The textarea is never removed from the DOM, only hidden. Taking it out
	 * would lose the caret, the selection and the undo history every time
	 * somebody glanced at the preview.
	 */
	import TextBox from './TextBox.svelte';
	import Written from './Written.svelte';
	import { renderMarkdown, type TodoRefs } from '$lib/markdown';
	import { sliding } from '$lib/actions/sliding';
	import { useT } from '$lib/i18n';
	import type { HTMLTextareaAttributes } from 'svelte/elements';

	/**
	 * How long the typing has to stop before the preview redraws.
	 *
	 * `{@html}` replaces the pane's contents wholesale, so rendering on every
	 * keystroke makes the images in a note flash as they are re-decoded — the
	 * flicker this is meant not to have. A tenth of a second is under what
	 * reads as a delay and above the gap between two keystrokes, so the preview
	 * follows the typing without being redrawn thirty times a word.
	 */
	const PREVIEW_SETTLE_MS = 120;

	let {
		value = $bindable(''),
		element = $bindable(),
		rows = 6,
		preview = 'markdown',
		todos = undefined,
		class: extra = '',
		...rest
	}: HTMLTextareaAttributes & {
		value?: string;
		/** The textarea itself, for whatever writes into it. See `TextBox`. */
		element?: HTMLTextAreaElement;
		rows?: number;
		/**
		 * Which drawing of the words the preview shows.
		 *
		 * A preview is only worth having if it is the thing itself, so it has
		 * to be drawn by whatever draws it afterwards. A note is a document and
		 * goes through the markdown renderer; a todo's notes and an idea are a
		 * sentence with a screenshot or a recording stuck to it, and `Written`
		 * is what the list draws them with. Previewing one as the other would
		 * promise formatting that never arrives, or hide the picture that does.
		 */
		preview?: 'markdown' | 'written';
		/**
		 * The tasks a reference in the writing may name, by their number in the
		 * notebook — what `renderMarkdown` resolves `TASK:#4` against.
		 *
		 * Optional, and left out by everything written outside a notebook: the
		 * diary and the capture wheel have no list to point at. Without it the
		 * preview drew the bare chip while the saved note drew the task's
		 * title, so the preview was showing something the note would not be.
		 */
		todos?: TodoRefs;
		class?: string;
	} = $props();

	const t = useT();

	/**
	 * Which pane is showing: one of them, or both beside each other.
	 *
	 * Writing is the default, which is what the box has always opened as.
	 *
	 * It used to go side by side on its own once the container passed `@2xl`,
	 * and no box in this app is that wide — the widest is about 540px — so that
	 * branch had never once drawn on a screen and the two tabs were the whole
	 * control. Side by side is a choice now, offered from `@lg`, which the
	 * ordinary boxes do reach: two columns of about 260px, which is tight and
	 * is the point of it being a choice rather than a width.
	 */
	let showing = $state<'write' | 'preview' | 'both'>('write');

	/**
	 * What is in the box, which is not the same as what was passed in.
	 *
	 * Most callers hand `value` over one-way — `value={entry.content}` — and
	 * the box writes what is typed back into its own copy of the prop. Any
	 * re-render of the caller then re-applies the original string, and what
	 * somebody typed since the last render vanishes until the next keystroke
	 * puts it back. That is the flicker: "characters getting deleted… they
	 * FLICK and disappear, like shit I just wrote in the last 0.5s", in the
	 * forms that use this box and not in the ones that do not.
	 *
	 * So the typing lives here, seeded from the prop and re-seeded only when
	 * the caller hands over a genuinely different thing — a second note opened
	 * in the same modal. The same shape `TagInput` uses, for the same reason,
	 * and `seededFrom` is a plain variable deliberately: it is a marker for
	 * this effect rather than something anything renders.
	 */
	let text = $state(value);
	let seededFrom = value;
	$effect(() => {
		const incoming = value;
		if (incoming === seededFrom) return;
		seededFrom = incoming;
		text = incoming;
	});

	/* And what is typed goes back out, for a caller that did bind. */
	$effect(() => {
		value = text;
	});

	/* What the preview is currently drawing — the text once the typing settles. */
	let settled = $state(value);
	$effect(() => {
		const next = text;
		const timer = setTimeout(() => (settled = next), PREVIEW_SETTLE_MS);
		return () => clearTimeout(timer);
	});

	const empty = $derived(settled.trim() === '');
</script>

<div class="@container {extra}">
	<!--
		Write, Preview, and — away to the right, where there is room for it —
		both at once.

		Each tab names itself. `Field` is a `<label>`, so a button inside it
		computes its accessible name from the whole field — which made "Write"
		answer to the name "Preview" as well, and a test picking the Preview tab
		by name pressed Write.

		Side by side is offered only where two columns would fit at all. Below
		that it is not a choice anybody could want, and `both` falls back to the
		editor alone — writing is what the box is for.
	-->
	<div class="seg mb-2" use:sliding role="tablist">
		<button
			type="button"
			role="tab"
			aria-selected={showing === 'write'}
			aria-label={t('markdown.write')}
			onclick={() => (showing = 'write')}
		>
			{t('markdown.write')}
		</button>
		<button
			type="button"
			role="tab"
			aria-selected={showing === 'preview'}
			aria-label={t('markdown.preview')}
			onclick={() => (showing = 'preview')}
		>
			{t('markdown.preview')}
		</button>
		<button
			type="button"
			role="tab"
			aria-selected={showing === 'both'}
			aria-label={t('markdown.sideBySide')}
			class="hidden @lg:inline-flex"
			onclick={() => (showing = 'both')}
		>
			{t('markdown.sideBySide')}
		</button>
	</div>

	<!--
		Below two columns, `both` is the editor: the preview is the pane that
		gives way, because writing is what the box is for.

		Narrow, the two panes are stacked in one cell rather than swapped.
		
		Hiding one with `display: none` made the box the height of whichever
		was showing, so choosing Preview on a short note pulled the picture
		row, the tags, the people and the footer up the screen — and choosing
		Write pushed them back down. Stacked, the cell is as tall as the taller
		of the two and the press moves nothing, which is the rule everywhere
		else in the app.

		Wide, the grid puts them side by side and `items-stretch` already made
		them agree.
	-->
	<div class="grid @lg:items-stretch @lg:gap-3 {showing === 'both' ? '@lg:grid-cols-2' : ''}">
		<!--
			`invisible` rather than `hidden`: the pane keeps its place in the
			cell, which is what holds the height. It is also taken out of the
			tab order and off the screen reader, since it is not the one being
			shown.
		-->
		<div
			class="col-start-1 row-start-1 @lg:col-start-1 {showing === 'preview' ? 'invisible' : ''}"
			aria-hidden={showing === 'preview' ? 'true' : undefined}
			inert={showing === 'preview' ? true : undefined}
		>
			<TextBox bind:value={text} bind:element {rows} {...rest} />
		</div>

		<div
			class="md col-start-1 row-start-1 overflow-y-auto rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-900 {showing ===
			'preview'
				? ''
				: showing === 'both'
					? 'invisible @lg:visible @lg:col-start-2'
					: 'invisible'}"
			aria-live="off"
			aria-label={t('markdown.preview')}
		>
			{#if empty}
				<p class="text-gray-500 italic">{t('markdown.nothingToPreviewYet')}</p>
			{:else if preview === 'written'}
				<Written content={settled} {todos} />
			{:else}
				<!-- `renderMarkdown` escapes every character of the input before it emits a
				     tag, and emits only attributes it writes itself. See `$lib/markdown.ts`. -->
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html renderMarkdown(settled, todos)}
			{/if}
		</div>
	</div>
</div>
