<script lang="ts">
	/**
	 * Put one label on something, from where its labels are drawn.
	 *
	 * The row already shows a task's words; the only way to add one to them
	 * was the edit dialog — open it, find the box, type, save, wait for the
	 * list to reorder. That is five steps for one word, and the word is
	 * usually being added *because* of what the row says, with the cursor
	 * already beside the last chip.
	 *
	 * So it is a chip of its own at the end of the strip. Pressing it turns
	 * into a field; typing and pressing Enter posts one label and nothing
	 * else, through an action that adds rather than replaces — see
	 * `todoHandlers.tag`. Escape gives up, and so does moving away.
	 *
	 * A component rather than markup inside the task row: a note, an idea and
	 * a picture all draw the same strip of labels and all want the same
	 * press, and the thing they do not share is only where it posts.
	 */
	import Icon from '$lib/components/Icon.svelte';
	import { enhance } from '$lib/enhance';
	import { useT } from '$lib/i18n';
	import { afterPress } from '$lib/after-press';
	import TagInput from '$lib/components/TagInput.svelte';

	let {
		/** What is being labelled, as the action's `id` field. */
		id,
		/** Where to post — the row's own `tag` action. */
		action,
		/** The labels it already has, so the box does not offer them again. */
		has = [],
		/** The account's whole vocabulary, for completion. */
		known = []
	}: {
		id: number;
		action: string;
		has?: readonly string[];
		known?: readonly string[];
	} = $props();

	const t = useT();

	let open = $state(false);
	let word = $state('');
	let form = $state<HTMLFormElement | null>(null);

	/*
	 * What the box offers: the vocabulary minus what this thing already
	 * carries, since offering a label it already has is offering to do nothing.
	 */
	const offer = $derived(known.filter((one) => !has.includes(one)));

	function give() {
		open = false;
		word = '';
	}

	function start() {
		open = true;
		// After the field exists, which is the frame after the press.
		afterPress(() => form?.querySelector<HTMLInputElement>('input:not([type="hidden"])')?.focus());
	}
</script>

<!--
	It opens over itself rather than beside itself.

	The chip sits in a narrow rail under the task's number, and a field opened
	in line widened the rail and pushed the whole card sideways. The chip keeps
	its place, made invisible, and the field floats over it.
-->
<span class="relative inline-flex">
	<button
		type="button"
		class="chip quick-tag"
		class:invisible={open}
		inert={open}
		onclick={start}
		title={t('quickTag.addATag')}
		aria-label={t('quickTag.addATag')}
	>
		<Icon name="tag" size={12} />
		<Icon name="plus" size={12} />
	</button>
	{#if open}
		<form
			method="post"
			{action}
			bind:this={form}
			class="quick-tag-open absolute top-0 left-0 z-20 inline-flex items-center gap-1 border border-gray-200 bg-white p-1 shadow-overlay"
			onkeydown={(key) => {
				// The box closes its own list on Escape first; a second one leaves.
				if (key.key === 'Escape' && !key.defaultPrevented) {
					key.preventDefault();
					give();
				}
			}}
			onfocusout={() => {
				// Given up on rather than submitted: an empty box is somebody who
				// pressed it and thought better of it, and a field left hanging
				// open on every row is the strip turned into a form.
				setTimeout(() => {
					if (!form?.contains(document.activeElement) && !word.trim()) give();
				});
			}}
			use:enhance={() =>
				async ({ update }) => {
					await update({ reset: false });
					give();
				}}
		>
			<input type="hidden" name="id" value={id} />
			<!--
				The app's own label box, not an input with a `<datalist>`: on
				Android the platform draws a datalist's suggestions as a detached
				layer, and tapping back into the field left it half on screen,
				transparent but still taking presses.
			-->
			<div class="w-48">
				<TagInput
					name="add"
					bind:value={word}
					known={offer}
					placeholder={t('quickTag.placeholder')}
				/>
			</div>
			<button type="submit" class="icon-btn" title={t('ui.save')} aria-label={t('ui.save')}>
				<Icon name="check" size={14} />
			</button>
		</form>
	{/if}
</span>
