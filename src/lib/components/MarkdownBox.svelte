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
	import { renderMarkdown } from '$lib/markdown';
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
		class: extra = '',
		...rest
	}: HTMLTextareaAttributes & {
		value?: string;
		/** The textarea itself, for whatever writes into it. See `TextBox`. */
		element?: HTMLTextAreaElement;
		rows?: number;
		class?: string;
	} = $props();

	const t = useT();

	/** Which pane the narrow layout is showing. Ignored once there is room for both. */
	let showing = $state<'write' | 'preview'>('write');

	/* What the preview is currently drawing — `value` once the typing settles. */
	let settled = $state(value);
	$effect(() => {
		const next = value;
		const timer = setTimeout(() => (settled = next), PREVIEW_SETTLE_MS);
		return () => clearTimeout(timer);
	});

	const empty = $derived(settled.trim() === '');
</script>

<div class="@container {extra}">
	<!--
		The chooser, only where there is not room for both. `@2xl:hidden` rather
		than a second markup path, so the two shapes cannot drift apart.

		Each tab names itself. `Field` is a `<label>`, so a button inside it
		computes its accessible name from the whole field — which made "Write"
		answer to the name "Preview" as well, and a test picking the Preview tab
		by name pressed Write.
	-->
	<div class="mb-2 flex gap-1 @2xl:hidden" role="tablist">
		<button
			type="button"
			role="tab"
			aria-selected={showing === 'write'}
			aria-label={t('markdown.write')}
			class="rounded px-3 py-1 text-xs font-medium transition {showing === 'write'
				? 'bg-gray-900 text-white'
				: 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
			onclick={() => (showing = 'write')}
		>
			{t('markdown.write')}
		</button>
		<button
			type="button"
			role="tab"
			aria-selected={showing === 'preview'}
			aria-label={t('markdown.preview')}
			class="rounded px-3 py-1 text-xs font-medium transition {showing === 'preview'
				? 'bg-gray-900 text-white'
				: 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
			onclick={() => (showing = 'preview')}
		>
			{t('markdown.preview')}
		</button>
	</div>

	<!--
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
	<div class="grid @2xl:grid-cols-2 @2xl:items-stretch @2xl:gap-3">
		<!--
			`invisible` rather than `hidden`: the pane keeps its place in the
			cell, which is what holds the height. It is also taken out of the
			tab order and off the screen reader, since it is not the one being
			shown.
		-->
		<div
			class="col-start-1 row-start-1 @2xl:col-start-1 {showing === 'write'
				? ''
				: 'invisible @2xl:visible'}"
			aria-hidden={showing === 'write' ? undefined : 'true'}
			inert={showing === 'write' ? undefined : true}
		>
			<TextBox bind:value bind:element {rows} {...rest} />
		</div>

		<div
			class="md col-start-1 row-start-1 overflow-y-auto rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-900 @2xl:col-start-2 {showing ===
			'preview'
				? ''
				: 'invisible @2xl:visible'}"
			aria-live="off"
			aria-label={t('markdown.preview')}
		>
			{#if empty}
				<p class="text-gray-400 italic">{t('markdown.nothingToPreviewYet')}</p>
			{:else}
				<!-- `renderMarkdown` escapes every character of the input before it emits a
				     tag, and emits only attributes it writes itself. See `$lib/markdown.ts`. -->
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html renderMarkdown(settled)}
			{/if}
		</div>
	</div>
</div>
