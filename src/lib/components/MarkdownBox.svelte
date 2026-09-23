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
	 * control.
	 *
	 * Side by side is a choice now, offered from `@sm`. It was `@lg`, which is
	 * 512px, and that fell between the two dialog widths this app has: the task
	 * and note editors are `md` and their box is 536px, the capture sheet is
	 * `sm` and its box is about 408px. So the same component offered the choice
	 * in one dialogue and not in the one beside it, which reads as two
	 * different editors. `@sm` is 384px — under every dialog and over a phone's
	 * own width, where two columns of prose is not a choice anybody could want
	 * and `both` falls back to the editor alone.
	 */
	let showing = $state<'write' | 'preview' | 'both'>('write');

	/**
	 * The single pane to come back to when Side by side is switched off.
	 *
	 * Side by side is a toggle over the pair rather than a third position:
	 * pressing it takes in whichever of the two you were on, and pressing it
	 * again gives you that one back. Coming back to Write always would throw
	 * away the answer somebody had just given.
	 */
	let lastSingle = $state<'write' | 'preview'>('write');

	function show(pane: 'write' | 'preview') {
		lastSingle = pane;
		showing = pane;
	}

	function toggleBoth() {
		showing = showing === 'both' ? lastSingle : 'both';
	}

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
	<div class="mb-2 flex items-center gap-2">
		<!--
			The pair, as one control with a position.

			The tile travels between Write and Preview — and when Side by side
			is on it covers them both, because both of them are what you are
			looking at. `sliding` measures whatever carries `aria-selected`, so
			marking both is the whole of that: nothing here has to know how wide
			two of them are.
		-->
		<div class="seg" use:sliding role="tablist">
			<button
				type="button"
				role="tab"
				aria-selected={showing === 'write' || showing === 'both'}
				aria-label={t('markdown.write')}
				onclick={() => show('write')}
			>
				{t('markdown.write')}
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={showing === 'preview' || showing === 'both'}
				aria-label={t('markdown.preview')}
				onclick={() => show('preview')}
			>
				{t('markdown.preview')}
			</button>
		</div>

		<!--
			And the one that takes in both, at the far end of the strip.

			A button rather than a third tab: it does not name a place the tile
			can be, it says how much of the pair to show. Only where two columns
			would fit at all — below that it is not a choice anybody could want,
			and `both` falls back to the editor alone, because writing is what
			the box is for.
		-->
		<button
			type="button"
			aria-pressed={showing === 'both'}
			class="seg-aside ml-auto hidden @sm:inline-flex"
			onclick={toggleBoth}
		>
			{t('markdown.sideBySide')}
		</button>
	</div>

	<!--
		Below two columns, `both` is the editor: the preview is the pane that
		gives way, because writing is what the box is for.

		Stacked, the editor is the one that sets the height and the preview is
		laid over it.

		Hiding one with `display: none` made the box the height of whichever was
		showing, so choosing Preview on a short note pulled the picture row, the
		tags, the people and the footer up the screen — and choosing Write
		pushed them back down. Both in one grid cell fixed that and bought a
		worse problem: a cell is as tall as its tallest item, so a long note's
		preview stretched the box to its own height and left a screen of dead
		space under an eight-row editor. There should never be more room there
		than there is writing in it.

		So the preview is taken out of the sizing — absolute over the editor,
		scrolling inside it. The height is the editor's at every moment, the
		press still moves nothing, and what the preview cannot fit it scrolls.

		Side by side is two columns in flow, where `items-stretch` makes them
		agree.
	-->
	<div
		class="relative grid @sm:items-stretch @sm:gap-3 {showing === 'both' ? '@sm:grid-cols-2' : ''}"
	>
		<!--
			The editor is always in flow, even while the preview is the one
			being read: it is what says how tall the box is, and `invisible`
			keeps it saying so.
		-->
		<div
			class="col-start-1 row-start-1 @sm:col-start-1 {showing === 'preview' ? 'invisible' : ''}"
			aria-hidden={showing === 'preview' ? 'true' : undefined}
			inert={showing === 'preview' ? true : undefined}
		>
			<TextBox bind:value={text} bind:element {rows} {...rest} />
		</div>

		<!--
			And the preview is laid over it, except side by side, where it is a
			column of its own and stretches to match.
		-->
		<div
			class="md overflow-y-auto rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-900 {showing ===
			'both'
				? 'invisible absolute inset-0 @sm:visible @sm:static @sm:col-start-2 @sm:row-start-1'
				: showing === 'preview'
					? 'absolute inset-0'
					: 'invisible absolute inset-0'}"
			aria-live="off"
			aria-label={t('markdown.preview')}
			aria-hidden={showing === 'write' ? 'true' : undefined}
			inert={showing === 'write' ? true : undefined}
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
