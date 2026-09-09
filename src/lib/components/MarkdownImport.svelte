<script lang="ts">
	import OneLine from '$lib/components/OneLine.svelte';

	/**
	 * A folder of `.md` files, read here and posted as text.
	 *
	 * One component rather than one per page. It began on the account's import
	 * screen and the Notebooks page linked to it, which meant "Import markdown"
	 * navigated away from notebooks to a page headed "An Obsidian vault" — the
	 * right form under a name nobody was looking for. Notebooks has it inline
	 * now, and this is the same form in both places rather than a simpler
	 * second one that would drift from it.
	 *
	 * The caller supplies the action, because the two pages post to their own.
	 */
	let {
		action = '?/importVault',
		enhancer,
		compact = false
	}: {
		action?: string;
		/** The page's own `use:` action for a form — each has a different one. */
		enhancer: (node: HTMLFormElement) => { destroy?: () => void } | void;
		/** Drops the explanatory paragraph, where the surrounding page said it. */
		compact?: boolean;
	} = $props();

	/**
	 * The path travels with the text because a vault's folders are structure,
	 * and `webkitRelativePath` is the only place it survives: `File.name` is the
	 * bare filename, so `Books/Republic.md` and `Trips/Republic.md` would arrive
	 * as the same thing.
	 */
	let files = $state<{ path: string; text: string }[]>([]);
	let problem = $state<string | null>(null);

	/** A vault beyond this is not going through a form field. */
	const MAX_BYTES = 8_000_000;

	async function read(event: Event) {
		problem = null;
		files = [];

		const input = event.currentTarget as HTMLInputElement;
		const chosen = [...(input.files ?? [])].filter((f) => f.name.toLowerCase().endsWith('.md'));

		if (chosen.length === 0) {
			problem = 'No markdown files in there. Choose the vault folder, or its .md files.';
			// Cleared, so choosing the same wrong folder again still fires a change.
			input.value = '';
			return;
		}

		const total = chosen.reduce((sum, f) => sum + f.size, 0);
		if (total > MAX_BYTES) {
			problem = `That is ${Math.round(total / 1_000_000)}MB of notes. Eight megabytes is the most this reads at once.`;
			input.value = '';
			return;
		}

		files = await Promise.all(
			chosen.map(async (f) => ({
				path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
				text: await f.text()
			}))
		);
	}
</script>

<form method="post" {action} use:enhancer class="space-y-3">
	<input type="hidden" name="files" value={JSON.stringify(files)} />

	<!--
		One input, both ways in: a folder on anything with `webkitdirectory`, and
		the files by hand everywhere else.
	-->
	<input
		type="file"
		multiple
		webkitdirectory
		accept=".md,text/markdown"
		class="input"
		onchange={read}
	/>

	{#if problem}
		<p class="text-sm text-red-700">{problem}</p>
	{:else if files.length > 0}
		<p class="text-sm text-gray-700">
			{files.length}
			{files.length === 1 ? 'note' : 'notes'} ready.
		</p>
	{/if}

	<label class="block text-sm text-gray-700">
		Name for the notebook they land in
		<OneLine name="notebook" placeholder="Obsidian" class="input mt-1" maxlength={80} />
	</label>

	{#if !compact}
		<p class="text-xs text-gray-500">
			Nothing is uploaded as a file — the notes are read here. Attachments, canvases and plugin data
			stay in the vault. Deleting the notebook undoes the import.
		</p>
	{/if}

	<button type="submit" class="btn btn-sm" disabled={files.length === 0}>Import</button>
</form>
