<script lang="ts">
	import { resolve } from '$app/paths';
	import OneLine from '$lib/components/OneLine.svelte';
	import Banner from '$lib/components/Banner.svelte';
	import Card from '$lib/components/Card.svelte';
	import MarkdownImport from '$lib/components/MarkdownImport.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { settingsForm } from '$lib/actions/settings-form';
	import { notify } from '$lib/notify.svelte';
	import type { ActionData, PageData } from './$types';
	import { IMPORT_KINDS } from '$lib/imports-catalogue';
	import { tooBigToSend } from '$lib/upload-ceiling';
	import { useT } from '$lib/i18n';

	const t = useT();

	/** The ones this card takes: a file, worked out by what is in it. */
	const fromFiles = IMPORT_KINDS.filter((k) => k.becomes === 'todos');

	let { data, form }: { data: PageData; form: ActionData } = $props();

	/**
	 * Whether this instance is the device it is running on.
	 *
	 * One thing turns on it: where the copy taken before a restore goes. A
	 * server writes it beside its database, where an operator can find it later
	 * without anybody having thought about it. There is no such place here, so
	 * the page takes the copy itself, as a download, before the form is sent.
	 */
	const onDevice = $derived('onDevice' in data && data.onDevice === true);

	/**
	 * The copy of this instance, taken before the restore replaces it.
	 *
	 * Returns false to call the submission off. That is the whole point of it:
	 * a restore empties the account first, so going ahead when the copy failed
	 * is exactly the situation the copy exists to prevent. What it returns
	 * instead, when it worked, is the file's name on the form — so the audit
	 * line still says a copy was taken and what it is called.
	 */
	async function keepACopyFirst(formData: FormData): Promise<boolean> {
		if (!onDevice) return true;

		try {
			const res = await fetch(resolve('/settings/account/export'));
			if (!res.ok) throw new Error(String(res.status));

			const name = `ontoplano-before-import-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
			const url = URL.createObjectURL(await res.blob());
			const link = document.createElement('a');
			link.href = url;
			link.download = name;
			link.click();
			URL.revokeObjectURL(url);

			formData.set('rescue', name);
			return true;
		} catch {
			notify.error(
				'Could not save a copy of what is here, so nothing was replaced. Try Export your data first.'
			);
			return false;
		}
	}

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
	const MAX_TASKS_BYTES = 2_000_000;

	/**
	 * What a restore may weigh, which is what the server can be sent at all.
	 *
	 * A whole account is not a task list: with pictures in it an export passes
	 * ten megabytes without trying. It used to be held to the same two, and
	 * being refused here left the box empty — so the form posted nothing and the
	 * server answered "that file is not JSON", which was true of the empty
	 * string and told nobody anything. Pasting it instead got as far as the
	 * server's own ceiling and came back a 500 with "something went wrong on
	 * our side".
	 *
	 * So the page knows the real number and says both: how big the file is, and
	 * what this instance takes.
	 */
	const restoreCeiling = $derived(data.uploadCeiling);

	async function readChosen(
		event: Event,
		{ many, ceiling }: { many: boolean; ceiling: number }
	): Promise<string | null> {
		fileError = null;
		const files = [...((event.currentTarget as HTMLInputElement).files ?? [])];
		if (files.length === 0) return null;

		const total = files.reduce((sum, f) => sum + f.size, 0);
		const refused = tooBigToSend(total, ceiling);
		if (refused) {
			fileError = refused;
			return null;
		}

		const texts = await Promise.all(files.map((f) => f.text()));
		// Many files become one array, which is what a Keep export is: Takeout
		// writes a note per file and the parser takes the list.
		return many && texts.length > 1 ? `[${texts.join(',\n')}]` : texts.join('\n');
	}

	async function readTasks(event: Event) {
		const text = await readChosen(event, { many: true, ceiling: MAX_TASKS_BYTES });
		if (text !== null) importText = text;
	}

	async function readRestore(event: Event) {
		const text = await readChosen(event, { many: false, ceiling: restoreCeiling });
		if (text !== null) {
			restoreText = text;
			// Choosing the file is the ask: the preview runs now, not behind a
			// second button somebody has to know about.
			previewForm?.requestSubmit();
		}
	}

	/**
	 * The preview, run for whatever is in the box.
	 *
	 * A restore empties the account first, so what the file holds — whose it
	 * was, what lands, what is left behind, what the import would refuse — has
	 * to be on the screen before REPLACE is typed. Posted through a form of its
	 * own so the answer arrives the same way every action's does; debounced for
	 * a paste, because a paste has no single finished moment the way choosing a
	 * file does.
	 */
	let previewForm = $state<HTMLFormElement>();
	let previewTimer: ReturnType<typeof setTimeout> | undefined;

	function previewSoon() {
		clearTimeout(previewTimer);
		if (!restoreText.trim() || restoreTooBig) return;
		previewTimer = setTimeout(() => previewForm?.requestSubmit(), 600);
	}

	const preview = $derived(
		form?.success && form.action === 'previewImport' && form.preview ? form.preview : null
	);

	/** "Bring in the rest" — only offered once the refusals are on screen. */
	let dropBad = $state(false);

	/**
	 * And a paste is measured too, on the way out rather than on the way back.
	 *
	 * Somebody who pastes sixteen megabytes into the box gets the same sentence
	 * as somebody who chose the file, instead of a 500 from a server that
	 * refused the body before this app saw it.
	 */
	const restoreTooBig = $derived(tooBigToSend(new Blob([restoreText]).size, restoreCeiling));
</script>

<div class="space-y-4">
	<p class="text-sm text-gray-500">
		<a href={resolve('/settings/account')} class="link"
			><Icon name="arrow-left" /> {t('settings.account.import.account')}</a
		>
	</p>

	<Card title={t('settings.account.import.fromAnotherApp')}>
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
				placeholder={t('settings.account.import.orPasteTheFileHere')}
				class="input font-mono text-xs"
			></textarea>

			{#if fileError}
				<p class="text-sm text-red-700">{fileError}</p>
			{/if}

			<label class="flex items-center gap-2 text-sm text-gray-700">
				<input type="checkbox" name="includeDone" />
				<span>{t('settings.account.import.bringFinishedTasksToo')}</span>
			</label>

			<label class="block text-sm text-gray-700">
				{t('settings.account.import.nameForTheNotebookThey')}
				<OneLine
					name="notebook"
					placeholder={t('settings.account.import.todoist')}
					class="input mt-1"
					maxlength={80}
				/>
			</label>

			<!-- The undo, said before the button rather than after the regret. -->
			<p class="text-xs text-gray-500">
				{t('settings.account.import.everythingArrivesAsTodosIn')}
			</p>

			<button type="submit" class="btn btn-sm">{t('settings.account.import.import')}</button>
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
	<Card title={t('settings.account.import.anObsidianVault')}>
		<p class="text-sm text-gray-500">
			{t('settings.account.import.chooseTheVaultSFolderEvery')}
			<code class="text-xs">{t('settings.account.import.tags')}</code>
			{t('settings.account.import.andFromTheFrontmatter')}
		</p>

		<div class="mt-3">
			<MarkdownImport enhancer={(node) => settingsForm(node, { notice: 'Imported.' })} />
		</div>

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
	<Card title={t('settings.account.import.restoreAnExport')} accent="#b45309">
		<p class="text-sm text-gray-500">
			{t('settings.account.import.aFileDownloadedFrom')}
			<strong>{t('settings.account.import.exportYourData')}</strong>{t(
				'settings.account.import.onThisInstanceOr'
			)}
		</p>

		<form
			method="post"
			action="?/importAccount"
			use:settingsForm={{ notice: 'Restored.', before: keepACopyFirst }}
			class="mt-3 space-y-3"
		>
			<input type="file" accept=".json,application/json" class="input" onchange={readRestore} />

			<textarea
				name="text"
				bind:value={restoreText}
				oninput={previewSoon}
				rows="3"
				placeholder={t('settings.account.import.orPasteTheExportHere')}
				class="input font-mono text-xs"
			></textarea>

			{#if restoreTooBig}
				<Banner kind="error">{restoreTooBig}</Banner>
			{/if}

			{#if preview}
				<!--
					What the restore will do, before the word that lets it.

					Numbers rather than adjectives: whose account, how many rows, and
					the two lists that matter — what is left behind by policy, and what
					the import would refuse outright. The second list is the one that
					used to surface as a failure three seconds after everything had
					already been emptied and rolled back.
				-->
				<div class="space-y-2 border border-gray-200 bg-gray-50 p-3 text-sm">
					<p class="text-gray-900">
						{#if preview.from}
							<strong>{preview.from.email}</strong>'s account, exported
							{preview.from.exportedAt.slice(0, 10)}:
						{/if}
						<strong>{preview.total}</strong>
						{t('settings.account.import.rowsWillLand')}
					</p>
					{#if preview.tables.length > 0}
						<p class="text-gray-600">
							{preview.tables
								.slice(0, 6)
								.map((t) => `${t.rows} ${t.name}`)
								.join(', ')}{preview.tables.length > 6
								? ` and ${preview.tables.length - 6} smaller tables`
								: ''}.
						</p>
					{/if}
					{#if preview.skipped.length > 0}
						<p class="text-gray-600">
							Left behind: {preview.skipped
								.map((skip) => `${skip.rows} ${skip.name} (${skip.why})`)
								.join('; ')}.
						</p>
					{/if}
					{#if preview.unacceptable.length > 0}
						<div class="border border-red-200 bg-red-50 p-2">
							<p class="text-sm text-gray-900">
								The restore would refuse this file:
								{preview.unacceptable
									.map((bad) => `${bad.rows} ${bad.name} ${bad.why}`)
									.join('; ')}.
							</p>
							<label class="mt-1 flex cursor-pointer items-start gap-2 text-sm text-gray-900">
								<input
									type="checkbox"
									name="dropUnacceptable"
									bind:checked={dropBad}
									class="mt-0.5"
								/>
								<span>{t('settings.account.import.leaveThoseOutAndBring')}</span>
							</label>
						</div>
					{/if}
				</div>
			{/if}

			<!--
				Said before the button, in the words of what it does.

				This is not "import": it empties the account and then fills it, so
				the sentence has to be the destructive one and the confirmation has
				to be typed rather than clicked.
			-->
			<div class="border border-amber-300 bg-amber-50 p-3">
				<p class="text-sm text-amber-900">
					{t('settings.account.import.this')}
					<strong>{t('settings.account.import.replacesEverythingInThisAccount')}</strong>
					{t('settings.account.import.withWhatIsInThe')}
				</p>
				<label class="mt-2 block text-sm text-amber-900">
					{t('ui.type')} <code class="text-xs">{t('settings.account.import.rEPLACE')}</code>
					{t('settings.account.import.toConfirm')}
					<OneLine name="confirm" class="input mt-1 max-w-[12rem]" />
				</label>
			</div>

			<p class="text-xs text-gray-500">
				{t('settings.account.import.dataRelatedToBillingApi')}
				<strong>{t('settings.account.import.not')}</strong>
				{t('settings.account.import.beImportedWhateverYouWrote')}
			</p>

			<!-- Not pressable while the thing in the box cannot be sent: the server
			     refuses a body that size before this app sees it, and what comes
			     back is a 500 rather than a reason. -->
			<!-- Not pressable while the thing in the box cannot be sent, or while
			     the preview has named rows the restore would refuse and nobody has
			     answered what to do about them. -->
			<button
				type="submit"
				class="btn btn-sm"
				disabled={restoreTooBig !== null ||
					(preview != null && preview.unacceptable.length > 0 && !dropBad)}
			>
				{t('settings.account.import.restore')}
			</button>
		</form>

		<!--
			Its own form, because it is its own act: this one writes nothing and
			needs no REPLACE. It carries the same text, posted the same way.
		-->
		<form
			method="post"
			action="?/previewImport"
			class="hidden"
			bind:this={previewForm}
			use:settingsForm={{}}
		>
			<input type="hidden" name="text" value={restoreText} />
		</form>

		{#if form?.success && form.action === 'importAccount'}
			<p class="mt-3 text-sm text-gray-700">{form.message}</p>
		{/if}
	</Card>
</div>
