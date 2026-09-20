<script lang="ts">
	/**
	 * The box where tags are typed, for every place that takes them.
	 *
	 * Two things, not one. The **chips** are the tags this thing has. The
	 * **input** holds only the word being typed, and empties the moment that
	 * word becomes a chip. What the form posts is assembled from the chips into
	 * a hidden field, so the server still receives the one comma-separated
	 * string it always did and nothing on it had to learn anything.
	 *
	 * The first version made the input and the chips two views of one string,
	 * which could not work: clearing the input would have deleted the chips, so
	 * it never cleared — and the word being typed was whatever trailed the last
	 * separator, which right after a space is nothing, so nothing was ever
	 * suggested. One mistake, both symptoms.
	 *
	 * The rules live in `$lib/tag-typing`, beside the tests that pin them.
	 */
	import Icon from '$lib/components/Icon.svelte';
	import { useT } from '$lib/i18n';
	import { draftTag, endsTag, suggestTags, tagsFrom, tagsValue } from '$lib/tag-typing';

	let {
		name = 'tags',
		value = '',
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

	/** The tags this thing has. Seeded from whatever the form arrived with. */
	let tags = $state<string[]>(tagsFrom(value));
	/** The word being typed. Nothing else lives in the input. */
	let draft = $state('');

	let box = $state<HTMLInputElement>();
	let focused = $state(false);
	let at = $state(-1);

	const suggestions = $derived(
		focused && draft.trim() !== '' ? suggestTags(known, draft, tags) : []
	);

	function add(tag: string | null) {
		if (tag && !tags.includes(tag)) tags = [...tags, tag];
		draft = '';
		at = -1;
	}

	function drop(tag: string) {
		tags = tags.filter((one) => one !== tag);
		box?.focus();
	}

	function onKeydown(e: KeyboardEvent) {
		// A suggestion picked out takes Enter and Tab before the word does.
		if (suggestions.length > 0 && at >= 0 && (e.key === 'Enter' || e.key === 'Tab')) {
			e.preventDefault();
			add(suggestions[at]);
			return;
		}

		if (endsTag(e.key)) {
			// Enter would submit the form and Tab would leave the field; both
			// mean "this word is done" first. A draft of nothing means neither,
			// so the key keeps whatever it normally does.
			if (draft.trim() === '') return;
			e.preventDefault();
			add(draftTag(draft, tags));
			return;
		}

		if (e.key === 'ArrowDown' && suggestions.length > 0) {
			e.preventDefault();
			at = (at + 1) % suggestions.length;
		} else if (e.key === 'ArrowUp' && suggestions.length > 0) {
			e.preventDefault();
			at = (at - 1 + suggestions.length) % suggestions.length;
		} else if (e.key === 'Escape' && at >= 0) {
			e.preventDefault();
			at = -1;
		} else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
			// Backspace at the start of an empty box takes the last chip off,
			// which is what every box of chips does and what a hand expects.
			e.preventDefault();
			tags = tags.slice(0, -1);
		}
	}

	function onBlur() {
		setTimeout(() => (focused = false), 150);
	}

	/*
	 * What the form posts: the chips, plus whatever is still being typed.
	 *
	 * Typing "urgent" and pressing Save without a space is somebody saying
	 * urgent, and losing it because they did not press the right key is the box
	 * being pedantic about its own mechanics.
	 *
	 * Counted here rather than turned into a chip when the field is left, which
	 * is what this did first and was worse than doing nothing: adding a chip on
	 * blur inserts a row, the row pushes the button down, and the press that
	 * caused the blur lands on whatever has moved into its place. The press
	 * that saves the form must not move the form.
	 */
	const posted = $derived(
		(() => {
			const pending = draftTag(draft, tags);
			return tagsValue(pending ? [...tags, pending] : tags);
		})()
	);
</script>

<div class="relative">
	<!-- What the form posts. The chips are the truth; this is their spelling. -->
	<input type="hidden" {name} value={posted} />

	{#if tags.length > 0}
		<div class="mb-2 flex flex-wrap gap-1.5">
			{#each tags as tag (tag)}
				<span class="chip inline-flex items-center gap-1">
					{tag}
					<button
						type="button"
						onclick={() => drop(tag)}
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
		bind:value={draft}
		{placeholder}
		type="text"
		class="input"
		autocomplete="off"
		role="combobox"
		aria-expanded={suggestions.length > 0}
		aria-controls="{name}-suggestions"
		onfocus={() => (focused = true)}
		onblur={onBlur}
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
							add(tag);
						}}
					>
						{tag}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
