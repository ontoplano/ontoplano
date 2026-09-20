<script lang="ts">
	/**
	 * The box where tags are typed, for every place that takes them.
	 *
	 * It was a plain text input. The server has always split what it holds on
	 * commas and spaces, so "work urgent" was two tags the moment it was saved
	 * — the box was the only thing that did not know, and there was no way to
	 * see which words the account already used without opening something else
	 * that had them on it.
	 *
	 * Now the words that are settled are chips, the one being typed suggests
	 * what it could be, and a space finishes it. The form value is unchanged:
	 * still one comma-separated string under the same name, so nothing on the
	 * server had to learn anything.
	 *
	 * The rules live in `$lib/tag-typing`, beside the tests that pin them.
	 */
	import Icon from '$lib/components/Icon.svelte';
	import { useT } from '$lib/i18n';
	import { splitTyping, suggestTags, withTag, withoutTag } from '$lib/tag-typing';

	let {
		name = 'tags',
		value = $bindable(''),
		/** The account's whole vocabulary, for suggesting. */
		known = [],
		placeholder = ''
	}: {
		name?: string;
		value?: string;
		known?: readonly string[];
		placeholder?: string;
	} = $props();

	const t = useT();

	let box = $state<HTMLInputElement>();
	let focused = $state(false);
	let at = $state(-1);

	const typing = $derived(splitTyping(value));
	const suggestions = $derived(
		focused && typing.draft.length > 0 ? suggestTags(known, typing.draft, typing.settled) : []
	);

	function choose(tag: string) {
		value = withTag(value, tag);
		at = -1;
		box?.focus();
	}

	function onKeydown(e: KeyboardEvent) {
		if (suggestions.length === 0) return;

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			at = (at + 1) % suggestions.length;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			at = (at - 1 + suggestions.length) % suggestions.length;
		} else if (e.key === 'Enter' && at >= 0) {
			// Only when one is picked out: Enter with nothing highlighted belongs
			// to the form, and stealing it would stop somebody submitting.
			e.preventDefault();
			choose(suggestions[at]);
		} else if (e.key === 'Escape' && at >= 0) {
			e.preventDefault();
			at = -1;
		}
	}
</script>

<div class="relative">
	<!--
		The chips are what is settled. They are not the value — the input is —
		so there is one source of truth and no way for the two to disagree.
	-->
	{#if typing.settled.length > 0}
		<div class="mb-2 flex flex-wrap gap-1.5">
			{#each typing.settled as tag (tag)}
				<span class="chip inline-flex items-center gap-1">
					{tag}
					<button
						type="button"
						onclick={() => (value = withoutTag(value, tag))}
						aria-label={t('tags.removeTag', { tag })}
						class="opacity-60 transition hover:opacity-100"
					>
						<Icon name="close" size={12} />
					</button>
				</span>
			{/each}
		</div>
	{/if}

	<input
		bind:this={box}
		bind:value
		{name}
		{placeholder}
		type="text"
		class="input"
		autocomplete="off"
		role="combobox"
		aria-expanded={suggestions.length > 0}
		aria-controls="{name}-suggestions"
		onfocus={() => (focused = true)}
		onblur={() => setTimeout(() => (focused = false), 150)}
		onkeydown={onKeydown}
	/>

	{#if suggestions.length > 0}
		<!--
			`mousedown` rather than `click`: the input's blur fires first and
			would take the list away before a click ever landed on it.
		-->
		<ul
			id="{name}-suggestions"
			class="overlay-face absolute z-20 mt-1 w-full overflow-hidden border shadow-overlay"
			role="listbox"
		>
			{#each suggestions as tag, i (tag)}
				<li role="presentation">
					<button
						type="button"
						role="option"
						aria-selected={i === at}
						class="block w-full px-3 py-2 text-left text-sm {i === at ? 'bg-gray-100' : ''}"
						onmousedown={(e) => {
							e.preventDefault();
							choose(tag);
						}}
					>
						{tag}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
