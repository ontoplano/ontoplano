<script lang="ts">
	/**
	 * A task's attributes, read, copied and changed one at a time.
	 *
	 * Opened from the ⓘ on a task card. The card has no room for a link or an
	 * order number, and those are exactly the things somebody wants to take
	 * somewhere else — so each value carries a copy button, and a pencil that
	 * edits that one value where it is. Only the value changes here: which
	 * attributes a task has is the task's own form, under the tags field.
	 *
	 * The pencil posts one pair, not the set (`setTodoAttribute`), so an
	 * edit here cannot drop a key written somewhere else in the meantime.
	 */
	import Modal from '$lib/components/Modal.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import { enhance } from '$lib/enhance';
	import { useT } from '$lib/i18n';

	const t = useT();

	/** How long "Copied" stays on the button that was pressed. */
	const COPIED_FOR_MS = 1600;

	let {
		open = $bindable(false),
		/** Whose attributes: named in the dialog's corner. */
		title,
		id,
		attributes,
		/** Where one changed value posts — see `TodoActionNames.attribute`. */
		action,
		onclose
	}: {
		open?: boolean;
		title: string;
		id: number;
		attributes: Record<string, string>;
		action: string;
		onclose?: () => void;
	} = $props();

	const rows = $derived(Object.entries(attributes));

	let editing = $state<string | null>(null);
	let copied = $state<string | null>(null);
	let timer: ReturnType<typeof setTimeout> | undefined;

	async function copy(key: string, value: string) {
		try {
			await navigator.clipboard.writeText(value);
		} catch {
			// A browser that will not: the value is on screen to select by hand,
			// and saying it was copied when it was not would be worse than nothing.
			return;
		}
		copied = key;
		clearTimeout(timer);
		timer = setTimeout(() => (copied = null), COPIED_FOR_MS);
	}

	function stopEditing(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		// The value's own Escape: it puts the row back rather than shutting the
		// whole dialog on somebody who only meant to stop typing.
		event.preventDefault();
		event.stopPropagation();
		editing = null;
	}
</script>

<Modal
	bind:open
	title={t('attributes.title')}
	size="sm"
	onclose={() => {
		editing = null;
		onclose?.();
	}}
>
	{#snippet badge()}
		<p class="truncate text-sm font-medium text-gray-900">{title}</p>
	{/snippet}
	{#if rows.length === 0}
		<p class="text-sm text-gray-500">{t('attributes.none')}</p>
	{:else}
		<ul class="divide-y divide-gray-200 border border-gray-200" data-tour="attributes-list">
			{#each rows as [key, value] (key)}
				<li class="list-row">
					<div class="list-row-main min-w-0">
						<span class="eyebrow block font-mono text-gray-600">{key}</span>
						<!--
							The value and its editor share one cell, so pressing the pencil
							swaps what is in it without moving the rows below.
						-->
						<div class="mt-0.5 grid min-h-11 items-center">
							<span
								class="text-sm break-words text-gray-900 [grid-area:1/1] {editing === key
									? 'invisible'
									: ''}">{value}</span
							>
							{#if editing === key}
								<!-- The keydown is Escape bubbling up from the field inside: the
								     form is where the edit ends, not a control of its own. -->
								<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
								<form
									method="post"
									{action}
									class="flex items-center gap-2 [grid-area:1/1]"
									onkeydown={stopEditing}
									use:enhance={() =>
										async ({ result, update }) => {
											await update({ reset: false });
											if (result.type === 'success') editing = null;
										}}
								>
									<input type="hidden" name="id" value={id} />
									<input type="hidden" name="key" value={key} />
									<OneLine
										name="value"
										{value}
										class="input min-w-0 flex-1"
										placeholder={t('attributes.emptyRemoves')}
										ariaLabel={key}
										autofocus
									/>
									<button
										type="submit"
										class="icon-btn shrink-0"
										title={t('ui.save')}
										aria-label={t('ui.save')}
									>
										<Icon name="check" />
									</button>
								</form>
							{/if}
						</div>
					</div>
					<div class="list-row-actions">
						<button
							type="button"
							class="icon-btn relative"
							title={t('attributes.copy', { key })}
							aria-label={t('attributes.copy', { key })}
							onclick={() => copy(key, value)}
						>
							<Icon name={copied === key ? 'check' : 'copy'} />
						</button>
						{#if editing === key}
							<button
								type="button"
								class="icon-btn"
								title={t('ui.cancel')}
								aria-label={t('ui.cancel')}
								onclick={() => (editing = null)}
							>
								<Icon name="close" />
							</button>
						{:else}
							<button
								type="button"
								class="icon-btn"
								title={t('attributes.edit', { key })}
								aria-label={t('attributes.edit', { key })}
								onclick={() => (editing = key)}
							>
								<Icon name="edit" />
							</button>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
		<p class="mt-2 h-4 text-xs text-gray-500" aria-live="polite">
			{copied ? t('ui.copied') : ''}
		</p>
	{/if}
</Modal>
