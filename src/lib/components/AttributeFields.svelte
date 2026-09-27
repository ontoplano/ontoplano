<script lang="ts">
	/**
	 * A thing's attributes, as rows of a name and a value.
	 *
	 * One editor for every place a thing describes itself this way: a task, a
	 * task block, an inventory item. The rows, the remove button, "+ Another"
	 * and the refusal of a value with no name are the same wherever you meet
	 * them; what differs is only which fields the form posts and what the
	 * server makes of them (see `services/task-attributes.ts` beside
	 * `services/inventory.ts`).
	 *
	 * `fold` puts it behind the same disclosure the ratings use, for a form
	 * where attributes are the exception. `present` is a hidden marker the
	 * form carries whenever the editor is on it, so the server can tell "every
	 * row was removed" (clear them) apart from "this request never carried
	 * attributes" (leave them alone) — a drag on the plan posts to the same
	 * action as the block's form.
	 *
	 * The suggestions are only suggestions — any valid name is accepted — but
	 * one a plugin has declared says so, because a bare `hard_alarm` gives no
	 * clue what reads it.
	 */
	import Icon from '$lib/components/Icon.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import MoreOptions from '$lib/components/MoreOptions.svelte';
	import { untrack } from 'svelte';
	import { namedAttributes } from '$lib/actions/named-attributes';
	import { ATTRIBUTE_FORM, type AttributeKeySuggestion } from '$lib/attribute-keys';
	import { useT } from '$lib/i18n';

	const t = useT();

	let {
		pairs = $bindable<[string, string][]>([]),
		/** The two parallel fields each row posts. */
		names = { key: ATTRIBUTE_FORM.key, value: ATTRIBUTE_FORM.value },
		/** A hidden marker posted whenever the editor is on the form. */
		present = '',
		suggestions = [],
		/** Whether a name alone is an attribute, which is what the placeholder says. */
		valueOptional = false,
		/** Behind a disclosure, open when there is anything in it. */
		fold = false,
		/** Under the rows: what reads them, when that is worth saying. */
		hint = ''
	}: {
		pairs?: [string, string][];
		names?: { key: string; value: string };
		present?: string;
		suggestions?: AttributeKeySuggestion[];
		valueOptional?: boolean;
		fold?: boolean;
		hint?: string;
	} = $props();

	const filled = $derived(pairs.filter(([key]) => key.trim()).length);
	// Opened by what it held when it was drawn, and after that by the person:
	// removing the last row must not snap the fold shut under the pointer.
	let open = $state(untrack(() => pairs.some(([key]) => key.trim())));
	const used = $derived(new Set(pairs.map(([key]) => key.trim())));
	const offered = $derived(suggestions.filter((one) => !used.has(one.key)));

	function add(key = '', value = '') {
		// A blank row is filled in rather than joined by another: a suggestion
		// pressed on an empty editor is the first row, not the second.
		const blank = pairs.findIndex(([k, v]) => !k.trim() && !v.trim());
		if (blank !== -1) pairs[blank] = [key, value];
		else pairs = [...pairs, [key, value]];
	}

	// Empty, the editor still offers one row to write in.
	$effect(() => {
		if (pairs.length === 0) pairs = [['', '']];
	});
</script>

{#snippet rows()}
	<div
		class="col-span-12 space-y-2"
		use:namedAttributes={{ message: () => t('attributes.needsAName'), names }}
	>
		{#if present}
			<input type="hidden" name={present} value="1" />
		{/if}
		{#each pairs as pair, i (i)}
			<div class="flex items-center gap-2">
				<OneLine
					name={names.key}
					bind:value={pair[0]}
					placeholder={t('attributes.namePlaceholder')}
					class="input min-w-0 flex-1"
				/>
				<!-- A value may be left out where a name alone is the attribute, and the
				     placeholder is where that is said, because the only other way to
				     find out is to try it. -->
				<OneLine
					name={names.value}
					bind:value={pair[1]}
					placeholder={valueOptional
						? t('attributes.valuePlaceholderOptional')
						: t('attributes.valuePlaceholder')}
					class="input min-w-0 flex-1"
				/>
				<!--
					A button, not an instruction. The server still reads a pair with
					no name as nothing, so this empties the row rather than inventing
					a second way to say the same thing. Invisible on an empty row
					rather than absent, so the row keeps its width.
				-->
				<button
					type="button"
					onclick={() => (pairs = pairs.filter((_, at) => at !== i))}
					class="icon-btn icon-btn-danger shrink-0 {pair[0] || pair[1] ? '' : 'invisible'}"
					title={t('attributes.remove')}
					aria-label={t('attributes.removeNamed', {
						written: pair[0] || t('attributes.beingWritten')
					})}
				>
					<Icon name="close" />
				</button>
			</div>
		{/each}
		<div class="flex flex-wrap items-center gap-2 pt-1">
			<button type="button" onclick={() => add()} class="btn btn-sm">
				{t('attributes.another')}
			</button>
			{#each offered as one (one.key)}
				<button
					type="button"
					onclick={() => add(one.key, one.example)}
					title={one.usedBy
						? t('attributes.readBy', { description: one.description, plugins: one.usedBy })
						: one.description}
					class="chip"
				>
					<span class="font-mono">{one.key}</span>
					{#if one.usedBy}
						<span class="text-[10px] text-gray-600">· {one.usedBy}</span>
					{/if}
				</button>
			{/each}
		</div>
		{#if hint}
			<p class="text-xs text-gray-500">{hint}</p>
		{/if}
	</div>
{/snippet}

{#if fold}
	<MoreOptions label={t('attributes.title')} count={filled} bind:open>
		{@render rows()}
	</MoreOptions>
{:else}
	{@render rows()}
{/if}
