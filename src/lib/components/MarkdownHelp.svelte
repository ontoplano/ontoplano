<script lang="ts">
	/**
	 * What a markdown box understands, one press away from it.
	 *
	 * The vocabulary is small and partly the app's own — `TASK:#4` is not
	 * markdown anybody learned elsewhere — so it was found by accident or not
	 * at all. Each line is shown as typed and as drawn, and the drawing is the
	 * renderer's own, so this cannot describe a feature the box does not have.
	 */
	import Icon from './Icon.svelte';
	import Modal from './Modal.svelte';
	import { renderMarkdown } from '$lib/markdown';
	import { useT } from '$lib/i18n';
	import type { PlainKey } from '$lib/i18n/keys';

	const t = useT();

	let open = $state(false);

	/** Typed, and what it is for. Drawn by `renderMarkdown` beside the words. */
	const FORMATTING: { typed: string; says: PlainKey }[] = [
		{ typed: '## A heading', says: 'markdown.help.heading' },
		{ typed: '**bold**, *italic*, ~~struck~~', says: 'markdown.help.emphasis' },
		{ typed: '`code`', says: 'markdown.help.code' },
		{ typed: '- a point\n- another', says: 'markdown.help.list' },
		{ typed: '1. first\n2. second', says: 'markdown.help.numbered' },
		{ typed: '- [ ] to do\n- [x] done', says: 'markdown.help.checklist' },
		{ typed: '> said elsewhere', says: 'markdown.help.quote' },
		{ typed: '[a link](https://example.com)', says: 'markdown.help.link' },
		{ typed: '| a | b |\n|---|---|\n| 1 | 2 |', says: 'markdown.help.table' }
	];

	/** References are shown as typed only: drawn here, they would point at nothing. */
	const REFERENCES: { typed: string; says: PlainKey }[] = [
		{ typed: '#12', says: 'markdown.help.noteBare' },
		{ typed: 'NOTE:#12', says: 'markdown.help.note' },
		{ typed: 'TASK:#4', says: 'markdown.help.task' }
	];
</script>

<button
	type="button"
	class="icon-btn text-gray-500 hover:text-gray-900"
	title={t('markdown.help.open')}
	aria-label={t('markdown.help.open')}
	onclick={() => (open = true)}
>
	<Icon name="info" size={16} />
</button>

<Modal bind:open title={t('markdown.help.title')} description={t('markdown.help.intro')} size="lg">
	<table class="w-full text-sm">
		<tbody class="divide-y divide-gray-200">
			{#each FORMATTING as row (row.typed)}
				<tr>
					<td class="py-2 pr-3 align-top"
						><pre class="text-xs whitespace-pre-wrap text-gray-700">{row.typed}</pre></td
					>
					<!-- `renderMarkdown` escapes every character of the input before it emits a
					     tag, and these inputs are the constants above. See `$lib/markdown.ts`. -->
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					<td class="md py-2 pr-3 align-top">{@html renderMarkdown(row.typed)}</td>
					<td class="py-2 align-top text-xs text-gray-500">{t(row.says)}</td>
				</tr>
			{/each}
		</tbody>
	</table>
	<p class="mt-2 text-xs text-gray-500">{t('markdown.help.pictures')}</p>

	<h3 class="eyebrow mt-5 mb-2 text-gray-600">{t('markdown.help.references')}</h3>
	<table class="w-full text-sm">
		<tbody class="divide-y divide-gray-200">
			{#each REFERENCES as row (row.typed)}
				<tr>
					<td class="w-28 py-2 pr-3 align-top"><code>{row.typed}</code></td>
					<td class="py-2 align-top text-xs text-gray-600">{t(row.says)}</td>
				</tr>
			{/each}
		</tbody>
	</table>
	<p class="mt-2 text-xs text-gray-500">{t('markdown.help.picker')}</p>
</Modal>
