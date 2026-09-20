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
	import { draftTags, endsTag, suggestTags, tagsFrom, tagsValue } from '$lib/tag-typing';

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

	/*
	 * And re-seeded when the form is handed a different thing.
	 *
	 * The chips are state rather than a view of the prop, which is the whole
	 * point — but state initialised once. A modal reused for a second task
	 * gets a new `value` and kept the first task's chips, so editing anything
	 * after the first showed the wrong labels and would have saved them.
	 *
	 * Keyed on the value the props carry, not on the chips, so typing into the
	 * box never triggers this: what is typed changes `tags`, and `value` only
	 * changes when the caller hands over a different thing.
	 */
	// A plain variable, deliberately: it is a marker for this effect and not
	// something anything renders, and making it reactive has the effect
	// depending on its own write.
	let seededFrom = value;
	$effect(() => {
		const incoming = value;
		if (incoming === seededFrom) return;
		seededFrom = incoming;
		tags = tagsFrom(incoming);
		draft = '';
	});
	/** The word being typed. Nothing else lives in the input. */
	let draft = $state('');

	let box = $state<HTMLInputElement>();
	let focused = $state(false);
	let at = $state(-1);

	const suggestions = $derived(
		focused && draft.trim() !== '' ? suggestTags(known, draft, tags) : []
	);

	function add(...made: string[]) {
		const fresh = made.filter((tag) => tag && !tags.includes(tag));
		if (fresh.length > 0) tags = [...tags, ...fresh];
		draft = '';
		at = -1;
	}

	/*
	 * Taking one off, after the press has finished being a press.
	 *
	 * Svelte delegates `onclick` from a container and walks the path calling
	 * handlers. Removing a chip inline rebuilds the list *during* that walk,
	 * the surviving chip's button reuses the node the walk is standing on, and
	 * its handler runs on the same press — so one press took two labels off.
	 * The stack said so: two calls, both from the one delegated dispatcher.
	 *
	 * A microtask lets the walk finish against the DOM it started on. Still
	 * before the frame is painted, so nothing is visible but the one removal.
	 */
	/*
	 * One press, one label.
	 *
	 * A single click was reaching two chips' handlers: the stack showed both
	 * calls coming from Svelte's one delegated dispatcher, with different
	 * closures. Deferring the change did not stop it, so the walk is not
	 * simply reading the live DOM and I cannot honestly say why it visits the
	 * second.
	 *
	 * What is certain is that both calls belong to one press, and one press
	 * means one label. The event's own timestamp is the press's identity — it
	 * is the same object being dispatched — so the second call is recognised
	 * and ignored. A guard rather than an explanation, and labelled as one.
	 */
	let handledPress = -1;
	function drop(tag: string, press: MouseEvent) {
		if (press.timeStamp === handledPress) return;
		handledPress = press.timeStamp;
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
			add(...draftTags(draft, tags));
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
			const pending = draftTags(draft, tags);
			return tagsValue(pending.length > 0 ? [...tags, ...pending] : tags);
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
						onclick={(e) => drop(tag, e)}
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
