<script lang="ts">
	import { enhance } from '$app/forms';
	import CaptureForm from '$lib/components/CaptureForm.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { notify } from '$lib/notify.svelte';
	import type { Capture } from '$lib/capture';
	import { useT } from '$lib/i18n';

	const t = useT();

	/**
	 * Writing one thing down, wherever the press came from.
	 *
	 * There were two copies of this — the dashboard's row of tiles and the
	 * capture pie each had their own dialog, their own form and their own
	 * `enhance`, differing in a Cancel button one of them had. Two copies is
	 * two answers to what happens when a capture fails, which is how the pie
	 * came to have none at all.
	 *
	 * ## It says where the thing went
	 *
	 * Capture exists so you can write something down without going to the room
	 * it belongs in — so the dialog closing is the only thing that happens, and
	 * on the screen you are looking at nothing changed. That reads as nothing
	 * having happened. The receipt names the room and quotes the thing, because
	 * "saved" leaves somebody to go and check, and going to check is the work
	 * capture was avoiding.
	 */
	let {
		capture,
		/** A failure the page already knows about, from a non-JS submit. */
		error = null,
		onclose
	}: { capture: Capture | null; error?: string | null; onclose: () => void } = $props();

	/**
	 * How much of what was written the receipt quotes.
	 *
	 * Long enough to recognise the thing, short enough that a pasted paragraph
	 * does not become the interface. An idea is a textarea; people paste into
	 * it.
	 */
	const QUOTED = 60;

	/** The thing itself, out of the field the capture says carries it. */
	function wrote(form: HTMLFormElement, which: Capture): string {
		const field = form.elements.namedItem(which.lead);
		const said =
			field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement ? field.value : '';
		const text = said.trim().replace(/\s+/g, ' ');
		return text.length > QUOTED ? `${text.slice(0, QUOTED).trimEnd()}…` : text;
	}
</script>

<Modal
	open={capture !== null}
	{onclose}
	title={capture ? t('capture.newThing', { thing: t(capture.label).toLowerCase() }) : ''}
	size="sm"
	{error}
>
	{#if capture}
		{@const which = capture}
		<form
			id="capture-form"
			method="post"
			action={which.action}
			use:enhance={({ formElement }) => {
				// Read before the submit: `update()` may reset the form, and on a
				// failure the fields are the only place the thing still exists.
				const said = wrote(formElement, which);
				return async ({ update, result }) => {
					/*
					 * `reset: false`, because this form is about to disappear.
					 *
					 * `update()` empties the form element before the dialog closes,
					 * and on a phone the round trip is long enough to watch it
					 * happen: every field blanks, and then the screen closes over
					 * the empty form it just made. The form is destroyed on close,
					 * so nothing wanted the reset — and on a failure it has to keep
					 * what was typed rather than throw it away.
					 */
					await update({ reset: false });
					if (result.type === 'success') {
						notify.success(said ? `Added to ${which.into}: ${said}` : `Added to ${which.into}.`);
						onclose();
						return;
					}
					/*
					 * And a failure says so out here as well as in the dialog.
					 *
					 * The dialog stays open holding what was typed, which is right;
					 * but the pie's copy of this had no error banner at all, so a
					 * refused capture looked like a dialog that had simply ignored
					 * the button.
					 */
					if (result.type === 'failure') {
						const said = (result.data as { message?: unknown } | undefined)?.message;
						notify.error(typeof said === 'string' && said ? said : 'That was not written down.');
					}
				};
			}}
		>
			<CaptureForm capture={which} />
		</form>
	{/if}

	{#snippet footer()}
		<button type="button" class="btn" onclick={onclose}>{t('ui.cancel')}</button>
		<button type="submit" form="capture-form" class="btn btn-primary">
			<Icon name="plus" />
			{t('ui.save')}
		</button>
	{/snippet}
</Modal>
