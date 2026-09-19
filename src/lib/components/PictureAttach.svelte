<script lang="ts">
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import { useT } from '$lib/i18n';

	const t = useT();

	/**
	 * Putting a picture into a piece of writing, the way it works everywhere else.
	 *
	 * Three ways in, because people already have three habits: paste a screenshot
	 * straight into the box, drop a file onto it, or press the button and choose
	 * one. All three do the same thing — upload it, and write
	 * `![name](/media/12)` at the cursor — so what lands in the text is markdown
	 * the person can see, move and delete like any other line. Nothing is hidden
	 * in an attachment list that the writing does not mention.
	 *
	 * ## Refusing before sending
	 *
	 * A file over the instance's ceiling is refused here, in the browser, before
	 * a byte of it leaves. Not because the server does not refuse it — it does,
	 * and that is where the rule lives — but because an over-large body never
	 * reaches this app's code at all: the Node adapter rejects it first and
	 * answers with something that is not JSON, which a page waiting for JSON
	 * reports as an unexplained crash. That is what somebody uploading a 1.1MB
	 * photograph actually saw.
	 */
	let {
		/** The textarea this writes into. */
		target
	}: { target?: HTMLTextAreaElement } = $props();

	let input = $state<HTMLInputElement>();
	let busy = $state(0);
	let problem = $state('');
	let dragging = $state(false);

	/** What this instance allows, from the shell's data. */
	const maxKilobytes = $derived(Number(page.data.maxPictureKilobytes ?? 500));

	/** Replace the selection, or insert at the cursor, and keep the cursor sane. */
	function write(text: string, replacing?: string) {
		if (!target) return;
		if (replacing) {
			const at = target.value.indexOf(replacing);
			if (at === -1) return;

			/*
			 * This half runs when the upload finishes, which is seconds after
			 * anybody started it — and by then they are typing somewhere else.
			 *
			 * It used to put the caret at the end of the line it had just
			 * written and take the focus back, so a sentence being typed while
			 * a screenshot uploaded ended up cut in half with the rest of it
			 * after the picture. The caret stays where the person put it; all
			 * that happens is that it moves by however much the text grew or
			 * shrank, and only if it was after the part that changed.
			 */
			const caret = { start: target.selectionStart ?? 0, end: target.selectionEnd ?? 0 };
			const after = at + replacing.length;
			const delta = text.length - replacing.length;
			const moved = (where: number) =>
				where >= after ? where + delta : where > at ? at + text.length : where;

			target.value = target.value.slice(0, at) + text + target.value.slice(after);
			target.setSelectionRange(moved(caret.start), moved(caret.end));
			// Nothing is watching this element's value, and nothing autogrows it
			// either, so both are told — but the focus is left where it is.
			target.dispatchEvent(new Event('input', { bubbles: true }));
			return;
		}
		// Inserting, which happens the instant somebody asks for it: the caret
		// goes after what was written, and the focus comes back to the box.
		const start = target.selectionStart ?? target.value.length;
		const end = target.selectionEnd ?? start;
		// A picture wants a line of its own; a newline before it when the line
		// is not already empty is what makes it render as a block.
		const before = target.value.slice(0, start);
		const lead = before === '' || before.endsWith('\n') ? '' : '\n';
		target.value = before + lead + text + '\n' + target.value.slice(end);
		const to = start + lead.length + text.length + 1;
		target.setSelectionRange(to, to);

		target.dispatchEvent(new Event('input', { bubbles: true }));
		target.focus();
	}

	/**
	 * What went wrong, in the server's own words where there are any.
	 *
	 * Two shapes arrive from the same address: the app's typed errors, which are
	 * `{ error: { message } }`, and this endpoint's own early refusals, which are
	 * `{ message }`. Reading only one of them is why "Pictures here are at most
	 * 500KB" reached somebody as "That picture would not upload."
	 */
	function said(body: unknown): string {
		if (!body || typeof body !== 'object') return '';
		const shape = body as { message?: unknown; error?: { message?: unknown } };
		const message = shape.error?.message ?? shape.message;
		return typeof message === 'string' ? message : '';
	}

	async function upload(file: File) {
		if (!file.type.startsWith('image/')) {
			problem = `${file.name} is not a picture.`;
			return;
		}
		if (file.size > maxKilobytes * 1024) {
			problem = `Pictures here are at most ${maxKilobytes}KB, and ${file.name} is ${Math.ceil(
				file.size / 1024
			)}KB.`;
			return;
		}

		const placeholder = `![uploading ${file.name}…]()`;
		write(placeholder);
		busy += 1;
		problem = '';

		try {
			const body = new FormData();
			body.set('file', file);
			const answer = await fetch('/media', { method: 'POST', body });
			const parsed = await answer.json().catch(() => null);

			if (!answer.ok) {
				write('', placeholder);
				problem = said(parsed) || `That picture would not upload (${answer.status}).`;
				return;
			}
			write(String((parsed as { markdown?: string })?.markdown ?? ''), placeholder);
		} catch {
			write('', placeholder);
			problem = 'That picture would not upload — the connection dropped.';
		} finally {
			busy -= 1;
		}
	}

	async function take(files: FileList | File[] | null | undefined) {
		for (const file of Array.from(files ?? [])) await upload(file);
	}

	/**
	 * Paste and drop are attached from here rather than written into every form.
	 *
	 * `$effect` so the handlers follow the textarea when a form is opened, closed
	 * and opened again — the element is a different one each time.
	 */
	$effect(() => {
		const box = target;
		if (!box) return;

		const onPaste = (e: ClipboardEvent) => {
			const files = Array.from(e.clipboardData?.items ?? [])
				.filter((i) => i.kind === 'file')
				.map((i) => i.getAsFile())
				.filter((f): f is File => f !== null && f.type.startsWith('image/'));
			if (files.length === 0) return;
			// Only when there is a picture in it: a paste that is also text must
			// still paste the text.
			e.preventDefault();
			void take(files);
		};
		const onDragOver = (e: DragEvent) => {
			if (!Array.from(e.dataTransfer?.types ?? []).includes('Files')) return;
			e.preventDefault();
			dragging = true;
		};
		const onDragLeave = () => (dragging = false);
		const onDrop = (e: DragEvent) => {
			if (!e.dataTransfer?.files?.length) return;
			e.preventDefault();
			dragging = false;
			void take(e.dataTransfer.files);
		};

		box.addEventListener('paste', onPaste);
		box.addEventListener('dragover', onDragOver);
		box.addEventListener('dragleave', onDragLeave);
		box.addEventListener('drop', onDrop);
		return () => {
			box.removeEventListener('paste', onPaste);
			box.removeEventListener('dragover', onDragOver);
			box.removeEventListener('dragleave', onDragLeave);
			box.removeEventListener('drop', onDrop);
		};
	});
</script>

<div class="mt-1 flex flex-wrap items-center gap-2 text-xs">
	<!--
		A plain file input, styled away: the button is the label, so the keyboard
		and the screen reader get a real control rather than a div that listens.

		Choosing the file is the whole gesture — there is no second button to
		press afterwards, and the input is emptied either way so the same file can
		be chosen twice.
	-->
	<input
		bind:this={input}
		type="file"
		accept="image/png,image/jpeg,image/webp,image/gif"
		multiple
		class="sr-only"
		onchange={async (e) => {
			const field = e.currentTarget as HTMLInputElement;
			await take(field.files);
			field.value = '';
		}}
	/>
	<button type="button" class="btn btn-sm btn-quiet" onclick={() => input?.click()}>
		<Icon name="image" />
		{t('pictures.add')}
	</button>
	<span class="text-gray-500">
		{#if busy > 0}
			{t('pictures.uploading')}
		{:else if dragging}
			{t('pictures.dropAnywhere')}
		{:else}
			{t('pictures.hint', { kilobytes: maxKilobytes })}
		{/if}
	</span>
</div>

{#if problem}
	<p class="mt-1 text-xs text-red-700">{problem}</p>
{/if}
