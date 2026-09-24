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
	let box = $state<HTMLInputElement | null>(null);

	/*
	 * Completion is a `datalist`, which is the browser's own.
	 *
	 * A hand-built list would have to answer for the keyboard, the screen
	 * reader and the phone, and the platform already does — see the standing
	 * preference for native controls. What it is given is the vocabulary
	 * minus what this thing already carries: offering a label it already has
	 * is offering to do nothing.
	 */
	const offer = $derived(known.filter((one) => !has.includes(one)));

	const listId = $derived(`quick-tag-${id}`);

	function give() {
		open = false;
		word = '';
	}

	function start() {
		open = true;
		// After the field exists, which is the frame after the press.
		afterPress(() => box?.focus());
	}
</script>

{#if open}
	<form
		method="post"
		{action}
		class="inline-flex items-center gap-1"
		use:enhance={() =>
			async ({ update }) => {
				await update({ reset: false });
				give();
			}}
	>
		<input type="hidden" name="id" value={id} />
		<!-- svelte-ignore a11y_autofocus -->
		<input
			bind:this={box}
			bind:value={word}
			name="add"
			list={listId}
			class="input h-7 w-32 py-0 text-xs"
			placeholder={t('quickTag.placeholder')}
			aria-label={t('quickTag.addALabel')}
			autocomplete="off"
			autofocus
			onkeydown={(key) => {
				if (key.key === 'Escape') {
					key.preventDefault();
					give();
				}
			}}
			onblur={() => {
				// Given up on rather than submitted: an empty box is somebody
				// who pressed it and thought better of it, and a field left
				// hanging open on every row is the strip turned into a form.
				if (!word.trim()) give();
			}}
		/>
		<datalist id={listId}>
			{#each offer as one (one)}
				<option value={one}></option>
			{/each}
		</datalist>
		<button type="submit" class="icon-btn" title={t('ui.save')} aria-label={t('ui.save')}>
			<Icon name="check" size={14} />
		</button>
	</form>
{:else}
	<button
		type="button"
		class="chip quick-tag"
		onclick={start}
		title={t('quickTag.addALabel')}
		aria-label={t('quickTag.addALabel')}
	>
		<Icon name="tag" size={12} />
		<Icon name="plus" size={12} />
	</button>
{/if}
