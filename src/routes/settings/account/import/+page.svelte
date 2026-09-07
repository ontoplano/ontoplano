<script lang="ts">
	import { resolve } from '$app/paths';
	import OneLine from '$lib/components/OneLine.svelte';
	import Card from '$lib/components/Card.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { settingsForm } from '$lib/actions/settings-form';
	import type { ActionData } from './$types';
	import { IMPORT_KINDS } from '$lib/imports-catalogue';

	/** The ones this card takes: a file, worked out by what is in it. */
	const fromFiles = IMPORT_KINDS.filter((k) => k.becomes === 'todos');

	let { form }: { form: ActionData } = $props();

	/**
	 * The chosen files, read here rather than posted.
	 *
	 * Three reasons, and none of them is style. The action wants text either way
	 * — somebody may paste instead of choosing — so reading it in the page means
	 * the textarea shows what is about to be imported. Nothing is uploaded, so
	 * nothing is written to the server's disk at any point. And Google Keep is
	 * one file per note, so "choose the files" has to mean all of them.
	 */
	let importText = $state('');
	let restoreText = $state('');
	let fileError = $state<string | null>(null);

	/** A paste beyond this is not a task list, and the server refuses it anyway. */
	const MAX_BYTES = 2_000_000;

	async function readChosen(event: Event, many: boolean): Promise<string | null> {
		fileError = null;
		const files = [...((event.currentTarget as HTMLInputElement).files ?? [])];
		if (files.length === 0) return null;

		const total = files.reduce((sum, f) => sum + f.size, 0);
		if (total > MAX_BYTES) {
			fileError = `That is ${Math.round(total / 1_000_000)}MB. Two megabytes is the most this reads at once.`;
			return null;
		}

		const texts = await Promise.all(files.map((f) => f.text()));
		// Many files become one array, which is what a Keep export is: Takeout
		// writes a note per file and the parser takes the list.
		return many && texts.length > 1 ? `[${texts.join(',\n')}]` : texts.join('\n');
	}

	async function readTasks(event: Event) {
		const text = await readChosen(event, true);
		if (text !== null) importText = text;
	}

	async function readRestore(event: Event) {
		const text = await readChosen(event, false);
		if (text !== null) restoreText = text;
	}

	/**
	 * A vault, chosen as a folder.
	 *
	 * `webkitdirectory` is what hands a browser a whole tree, and it is
	 * non-standard in name only — every engine has had it for a decade. The
	 * fallback is choosing the `.md` files by hand, which the same input takes.
	 *
	 * The path travels with the text because a vault's folders are structure,
	 * and `webkitRelativePath` is the only place it survives: `File.name` is the
	 * bare filename, so `Books/Republic.md` and `Trips/Republic.md` would arrive
	 * as the same thing.
	 */
	let vaultFiles = $state<{ path: string; text: string }[]>([]);
	let vaultError = $state<string | null>(null);

	/** A vault beyond this is not going through a form field. */
	const MAX_VAULT_BYTES = 8_000_000;

	async function readVault(event: Event) {
		vaultError = null;
		vaultFiles = [];

		const chosen = [...((event.currentTarget as HTMLInputElement).files ?? [])].filter((f) =>
			f.name.toLowerCase().endsWith('.md')
		);

		if (chosen.length === 0) {
			vaultError = 'No markdown files in there. Choose the vault folder, or its .md files.';
			return;
		}

		const total = chosen.reduce((sum, f) => sum + f.size, 0);
		if (total > MAX_VAULT_BYTES) {
			vaultError = `That is ${Math.round(total / 1_000_000)}MB of notes. Eight megabytes is the most this reads at once.`;
			return;
		}

		vaultFiles = await Promise.all(
			chosen.map(async (f) => ({
				path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
				text: await f.text()
			}))
		);
	}
</script>

<div class="space-y-4">
	<p class="text-sm text-gray-500">
		<a href={resolve('/settings/account')} class="link"><Icon name="arrow-left" /> Account</a>
	</p>

	<Card title="From another app">
		<!--
			Named from `$lib/imports-catalogue`, which is also what `/api/imports`
			answers with and what ontoplano.com's FAQ is built from. Three places
			listed these by hand and the site was a source behind for weeks.
		-->
		<p class="text-sm text-gray-500">
			{#each fromFiles as kind, i (kind.id)}<strong>{kind.name}</strong> ({kind.file}){i <
				fromFiles.length - 2
					? ', '
					: i === fromFiles.length - 2
						? ' or '
						: '. '}{/each}Which one it is is worked out from the file.
		</p>

		<form
			method="post"
			action="?/importTasks"
			use:settingsForm={{ notice: 'Imported.' }}
			class="mt-3 space-y-3"
		>
			<!--
				No `name` on the file input, deliberately: it is read in the page and
				never submitted. With one, the browser uploads the file as well and
				the server buffers a copy it has no use for.
			-->
			<input
				type="file"
				multiple
				accept=".csv,.json,.org,text/csv,application/json,text/plain"
				class="input"
				onchange={readTasks}
			/>

			<textarea
				name="text"
				bind:value={importText}
				rows="4"
				placeholder="…or paste the file here"
				class="input font-mono text-xs"
			></textarea>

			{#if fileError}
				<p class="text-sm text-red-700">{fileError}</p>
			{/if}

			<label class="flex items-center gap-2 text-sm text-gray-700">
				<input type="checkbox" name="includeDone" />
				<span>Bring finished tasks too</span>
			</label>

			<label class="block text-sm text-gray-700">
				Name for the notebook they land in
				<OneLine name="notebook" placeholder="Todoist" class="input mt-1" maxlength={80} />
			</label>

			<!-- The undo, said before the button rather than after the regret. -->
			<p class="text-xs text-gray-500">
				Everything arrives as todos in one notebook. Deleting that notebook undoes the import.
			</p>

			<button type="submit" class="btn btn-sm">Import</button>
		</form>

		{#if form?.success && form.action === 'importTasks'}
			<p class="mt-3 text-sm text-gray-700">{form.message}</p>
		{/if}
	</Card>

	<!--
		A vault is writing, so it lands where writing lands.

		Its own card rather than a fourth source in the one above: those three
		hand over a list and become todos, and this hands over notes and becomes
		entries. Same button, different thing arriving.
	-->
	<Card title="An Obsidian vault">
		<p class="text-sm text-gray-500">
			Choose the vault's folder. Every note becomes an entry in one notebook, keeping its text and
			its tags — from <code class="text-xs">#tags</code> and from the frontmatter — with the folder it
			was in as a tag too.
		</p>

		<form
			method="post"
			action="?/importVault"
			use:settingsForm={{ notice: 'Imported.' }}
			class="mt-3 space-y-3"
		>
			<input type="hidden" name="files" value={JSON.stringify(vaultFiles)} />

			<!--
				One input, both ways in: a folder on anything with
				`webkitdirectory`, and the files by hand everywhere else.
			-->
			<input
				type="file"
				multiple
				webkitdirectory
				accept=".md,text/markdown"
				class="input"
				onchange={readVault}
			/>

			{#if vaultError}
				<p class="text-sm text-red-700">{vaultError}</p>
			{:else if vaultFiles.length > 0}
				<p class="text-sm text-gray-700">
					{vaultFiles.length}
					{vaultFiles.length === 1 ? 'note' : 'notes'} ready.
				</p>
			{/if}

			<label class="block text-sm text-gray-700">
				Name for the notebook they land in
				<OneLine name="notebook" placeholder="Obsidian" class="input mt-1" maxlength={80} />
			</label>

			<p class="text-xs text-gray-500">
				Nothing is uploaded as a file — the notes are read here. Attachments, canvases and plugin
				data stay in the vault. Deleting the notebook undoes the import.
			</p>

			<button type="submit" class="btn btn-sm" disabled={vaultFiles.length === 0}>Import</button>
		</form>

		{#if form?.success && form.action === 'importVault'}
			<p class="mt-3 text-sm text-gray-700">{form.message}</p>
		{/if}
	</Card>

	<!--
		The other half of the export, and the one that makes it mean something.

		Its own card rather than a second button on the one above, because they
		are opposite in consequence: one adds a notebook, the other overwrites
		everything here.
	-->
	<Card title="Restore an export" accent="#b45309">
		<p class="text-sm text-gray-500">
			A file downloaded from <strong>Export your data</strong>, on this instance or another one.
			Moving to your own server, or off it, is this and nothing else.
		</p>

		<form
			method="post"
			action="?/importAccount"
			use:settingsForm={{ notice: 'Restored.' }}
			class="mt-3 space-y-3"
		>
			<input type="file" accept=".json,application/json" class="input" onchange={readRestore} />

			<textarea
				name="text"
				bind:value={restoreText}
				rows="3"
				placeholder="…or paste the export here"
				class="input font-mono text-xs"
			></textarea>

			<!--
				Said before the button, in the words of what it does.

				This is not "import": it empties the account and then fills it, so
				the sentence has to be the destructive one and the confirmation has
				to be typed rather than clicked.
			-->
			<div class="border border-amber-300 bg-amber-50 p-3">
				<p class="text-sm text-amber-900">
					This <strong>replaces everything in this account</strong> with what is in the file. What is
					here now is gone, and nothing merges.
				</p>
				<label class="mt-2 block text-sm text-amber-900">
					Type <code class="text-xs">REPLACE</code> to confirm
					<OneLine name="confirm" class="input mt-1 max-w-[12rem]" />
				</label>
			</div>

			<p class="text-xs text-gray-500">
				Data related to billing, API tokens, calendar feed addresses, audit logs, or other things
				specific to the instance that issued them will <strong>not</strong> be imported. Whatever you
				wrote will.
			</p>

			<button type="submit" class="btn btn-sm">Restore</button>
		</form>

		{#if form?.success && form.action === 'importAccount'}
			<p class="mt-3 text-sm text-gray-700">{form.message}</p>
		{/if}
	</Card>
</div>
