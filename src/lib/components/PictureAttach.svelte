<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';

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
	 * While it uploads, a placeholder holds the spot and is replaced in place. If
	 * the upload fails the placeholder is removed and the reason is said out
	 * loud: a silent failure here looks like a picture that did not paste.
	 */
	let {
		/** The textarea this writes into. */
		target
	}: { target?: HTMLTextAreaElement } = $props();

	let input = $state<HTMLInputElement>();
	let busy = $state(0);
	let problem = $state('');
	let dragging = $state(false);

	/** Replace the selection, or insert at the cursor, and keep the cursor sane. */
	function write(text: string, replacing?: string) {
		if (!target) return;
		if (replacing) {
			const at = target.value.indexOf(replacing);
			if (at === -1) return;
			target.value = target.value.slice(0, at) + text + target.value.slice(at + replacing.length);
			target.setSelectionRange(at + text.length, at + text.length);
		} else {
			const start = target.selectionStart ?? target.value.length;
			const end = target.selectionEnd ?? start;
			// A picture wants a line of its own; a newline before it when the line
			// is not already empty is what makes it render as a block.
			const before = target.value.slice(0, start);
			const lead = before === '' || before.endsWith('\n') ? '' : '\n';
			target.value = before + lead + text + '\n' + target.value.slice(end);
			const to = start + lead.length + text.length + 1;
			target.setSelectionRange(to, to);
		}
		// Svelte is not watching this element's value, and neither is anything
		// that autogrows it, so both are told.
		target.dispatchEvent(new Event('input', { bubbles: true }));
		target.focus();
	}

	async function upload(file: File) {
		if (!file.type.startsWith('image/')) return;

		const placeholder = `![uploading ${file.name}…]()`;
		write(placeholder);
		busy += 1;
		problem = '';

		try {
			const body = new FormData();
			body.set('file', file);
			const answer = await fetch('/media', { method: 'POST', body });
			const said = await answer.json().catch(() => ({}));

			if (!answer.ok) {
				write('', placeholder);
				problem = said.message ?? 'That picture would not upload.';
				return;
			}
			write(said.markdown, placeholder);
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
	-->
	<input
		bind:this={input}
		type="file"
		accept="image/png,image/jpeg,image/webp,image/gif"
		multiple
		class="sr-only"
		onchange={(e) => {
			void take((e.currentTarget as HTMLInputElement).files);
			(e.currentTarget as HTMLInputElement).value = '';
		}}
	/>
	<button type="button" class="btn btn-sm btn-quiet" onclick={() => input?.click()}>
		<Icon name="image" /> Add a picture
	</button>
	<span class="text-gray-500">
		{#if busy > 0}
			uploading…
		{:else if dragging}
			drop it anywhere in the box
		{:else}
			…or paste one, or drop one in
		{/if}
	</span>
</div>

{#if problem}
	<p class="mt-1 text-xs text-red-700">{problem}</p>
{/if}
