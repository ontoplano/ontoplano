<script lang="ts">
	import { tick } from 'svelte';
	import { resolve } from '$app/paths';
	import OneLine from '$lib/components/OneLine.svelte';
	import Banner from '$lib/components/Banner.svelte';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import SettingGroup from '$lib/components/SettingGroup.svelte';
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

	/** "Todoist (CSV), Google Tasks (JSON) or Keep (…)", in the reader's language. */
	const fromFilesList = $derived(
		new Intl.ListFormat(t.locale, { type: 'disjunction' }).format(
			fromFiles.map((kind) => `${kind.name} (${kind.file})`)
		)
	);

	/** How many tables the preview names before it says "and N smaller ones". */
	const TABLES_NAMED = 6;

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
	/**
	 * What was wrong with the file, said by the card that asked for it.
	 *
	 * One `fileError` used to serve both, and it was drawn under the first card
	 * only — so choosing an export too big for this instance printed the reason
	 * three cards further up, under somebody else's file input, and the restore
	 * card simply sat there with an empty box. The next press posted nothing and
	 * the server answered "That file is not JSON", which was true of the empty
	 * string and of nothing a person had done.
	 */
	let tasksError = $state<string | null>(null);
	let restoreError = $state<string | null>(null);

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
		{ many, ceiling }: { many: boolean; ceiling: number },
		refuse: (why: string) => void
	): Promise<string | null> {
		const files = [...((event.currentTarget as HTMLInputElement).files ?? [])];
		if (files.length === 0) return null;

		const total = files.reduce((sum, f) => sum + f.size, 0);
		const refused = tooBigToSend(total, ceiling);
		if (refused) {
			refuse(refused);
			return null;
		}

		const texts = await Promise.all(files.map((f) => f.text()));
		// Many files become one array, which is what a Keep export is: Takeout
		// writes a note per file and the parser takes the list.
		return many && texts.length > 1 ? `[${texts.join(',\n')}]` : texts.join('\n');
	}

	async function readTasks(event: Event) {
		tasksError = null;
		const text = await readChosen(
			event,
			{ many: true, ceiling: MAX_TASKS_BYTES },
			(why) => (tasksError = why)
		);
		if (text !== null) importText = text;
	}

	/**
	 * The export, read and looked at before anything is offered to the server.
	 *
	 * A file, and only a file: a restore is a whole account and the box it used
	 * to be pasted into held fifteen megabytes of base64 nobody was going to
	 * read. What it does instead is answer here — too big for this instance,
	 * not JSON at all, JSON that is not an export — so the reason names the
	 * file rather than arriving as the server's verdict on an empty string.
	 */
	async function readRestore(event: Event) {
		restoreError = null;
		restoreText = '';
		const input = event.currentTarget as HTMLInputElement;
		const text = await readChosen(
			event,
			{ many: false, ceiling: restoreCeiling },
			(why) => (restoreError = `${why} ${t('settings.account.import.orExportAgainWithout')}`)
		);
		if (text === null) {
			// Nothing usable is in the box, so nothing usable is in the input
			// either: a name sitting there under a refusal reads as "this is
			// loaded", and the next press is the one that finds out it is not.
			input.value = '';
			return;
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(text);
		} catch {
			restoreError = t('settings.account.import.thatFileIsNotJson');
			input.value = '';
			return;
		}
		// The same thing `parseExport` asks of it, so the page and the service
		// cannot disagree about what an export is: an object with the account's
		// tables under `data`.
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !('data' in parsed)) {
			restoreError = t('settings.account.import.thatIsJsonButNotAnExport');
			input.value = '';
			return;
		}

		restoreText = text;
		/*
		 * And only then the preview, one tick later.
		 *
		 * The form carries the text in a hidden field, and an assignment does not
		 * reach the DOM until the next flush — so submitting in the same breath
		 * posted the field as it was a moment ago, which is empty. What came back
		 * was the server's verdict on an empty string: "That file is not JSON",
		 * about a file that is perfectly good JSON.
		 *
		 * Choosing the file is the ask, so it still runs itself: the wait is for
		 * the DOM, not for a second button somebody has to know about.
		 */
		await tick();
		previewForm?.requestSubmit();
	}

	/**
	 * The preview, run for the file that was chosen.
	 *
	 * A restore empties the account first, so what the file holds — whose it
	 * was, what lands, what is left behind, what the import would refuse — has
	 * to be on the screen before the word is typed, not in the message after.
	 * Posted through a form of its own so the answer arrives the same way every
	 * action's does. Choosing a file is a finished moment, so it runs then and
	 * needs no debounce.
	 */
	let previewForm = $state<HTMLFormElement>();

	const preview = $derived(
		form?.success && form.action === 'previewImport' && form.preview ? form.preview : null
	);

	/** "Bring in the rest" — only offered once the refusals are on screen. */
	let dropBad = $state(false);

	/**
	 * The word that has to be typed, and the sentence asking for it.
	 *
	 * The word is translated — a Portuguese screen asks for SUBSTITUIR — and the
	 * action accepts that language's word as well as the English one, so what is
	 * shown here and what is checked there cannot come apart.
	 *
	 * The sentence arrives whole and is split where the word goes, so the word can
	 * be drawn as code wherever a language happens to put it. What is put in the
	 * placeholder is the placeholder, which is the one value guaranteed not to
	 * appear in the sentence around it.
	 */
	const WORD_SLOT = '{word}';
	const confirmWord = $derived(t('settings.account.import.rEPLACE'));
	const confirmLabel = $derived(
		t('settings.account.import.typeWordToConfirm', { word: WORD_SLOT }).split(WORD_SLOT)
	);
</script>

<div class="space-y-4">
	<a href={resolve('/settings/account')} class="btn btn-sm btn-quiet">
		<Icon name="arrow-left" />
		{t('settings.account.import.account')}
	</a>

	<!--
		One surface, a band per way in — the shape of the account page this is
		a level under. Each form keeps its fields stacked with the button after
		them, the same as the vault form it sits beside.
	-->
	<RoomSurface>
		<SettingGroup
			title={t('settings.account.import.fromAnotherApp')}
			description="{fromFilesList}. {t('settings.account.import.whichOneItIsIs')}"
		>
			<!--
				Named from `$lib/imports-catalogue`, which is also what `/api/imports`
				answers with and what ontoplano.com's FAQ is built from.
			-->
			<form
				method="post"
				action="?/importTasks"
				use:settingsForm={{ notice: t('settings.account.import.imported') }}
				class="max-w-3xl space-y-3 px-4 py-3"
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
					aria-label={t('settings.account.import.fromAnotherApp')}
					onchange={readTasks}
				/>
				<textarea
					name="text"
					bind:value={importText}
					rows="4"
					aria-label={t('settings.account.import.orPasteTheFileHere')}
					placeholder={t('settings.account.import.orPasteTheFileHere')}
					class="textarea font-mono text-xs"
				></textarea>
				{#if tasksError}
					<Banner kind="error" message={tasksError} />
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
				{#if form?.success && form.action === 'importTasks'}
					<Banner kind="success" message={form.message} />
				{/if}
			</form>
		</SettingGroup>

		<!--
			A vault is writing, so it lands where writing lands: those three hand
			over a list and become todos, this hands over notes and becomes entries.
		-->
		<SettingGroup title={t('settings.account.import.anObsidianVault')}>
			<div class="max-w-3xl space-y-3 px-4 py-3">
				<p class="text-sm text-gray-500">
					{t('settings.account.import.chooseTheVaultSFolderEvery')}
					<code class="text-xs">{t('settings.account.import.tags')}</code>
					{t('settings.account.import.andFromTheFrontmatter')}
				</p>
				<MarkdownImport
					enhancer={(node) => settingsForm(node, { notice: t('settings.account.import.imported') })}
				/>
				{#if form?.success && form.action === 'importVault'}
					<Banner kind="success" message={form.message} />
				{/if}
			</div>
		</SettingGroup>

		<!--
			The other half of the export, and the one that makes it mean something.
			Its own band because the two are opposite in consequence: one adds a
			notebook, the other overwrites everything here.
		-->
		<SettingGroup title={t('settings.account.import.restoreAnExport')}>
			<form
				method="post"
				action="?/importAccount"
				use:settingsForm={{
					notice: t('settings.account.import.restored'),
					before: keepACopyFirst
				}}
				class="max-w-3xl space-y-3 px-4 py-3"
			>
				<p class="text-sm text-gray-500">
					{t('settings.account.import.aFileDownloadedFrom')}
					<strong>{t('settings.account.import.exportYourData')}</strong>{t(
						'settings.account.import.onThisInstanceOr'
					)}
				</p>
				<!--
					The file and nothing else: an export is not a thing anybody pastes —
					the one that prompted taking the box out was fifteen megabytes.
				-->
				<input
					type="file"
					accept=".json,application/json"
					class="input"
					aria-label={t('settings.account.import.restoreAnExport')}
					onchange={readRestore}
				/>
				<input type="hidden" name="text" value={restoreText} />
				{#if restoreError}
					<Banner kind="error">{restoreError}</Banner>
				{/if}
				{#if preview}
					<!--
						What the restore will do, before the word that lets it: whose
						account, how many rows, what is left behind by policy, and what
						the import would refuse outright.
					-->
					<Banner kind="info">
						<p>
							{#if preview.from}
								<strong>{preview.from.email}</strong>{t('settings.account.import.sAccountExported')}
								{preview.from.exportedAt.slice(0, 10)}:
							{/if}
							<strong>{preview.total}</strong>
							{t('settings.account.import.rowsWillLand')}
						</p>
						{#if preview.tables.length > 0}
							<p class="mt-1 text-gray-600">
								{preview.tables
									.slice(0, TABLES_NAMED)
									.map((table) => `${table.rows} ${table.name}`)
									.join(', ')}{preview.tables.length > TABLES_NAMED
									? t('settings.account.import.andSmallerTables', {
											count: preview.tables.length - TABLES_NAMED
										})
									: ''}.
							</p>
						{/if}
						{#if preview.skipped.length > 0}
							<p class="mt-1 text-gray-600">
								{t('settings.account.import.leftBehind')}
								{preview.skipped
									.map((skip) => `${skip.rows} ${skip.name} (${t(skip.why)})`)
									.join('; ')}.
							</p>
						{/if}
					</Banner>
					{#if preview.unacceptable.length > 0}
						<Banner kind="error">
							<p>
								{t('settings.account.import.theRestoreWouldRefuseThis')}
								{preview.unacceptable
									.map((bad) => `${bad.rows} ${bad.name} ${t(bad.why)}`)
									.join('; ')}.
							</p>
							<label class="mt-1 flex cursor-pointer items-start gap-2">
								<input
									type="checkbox"
									name="dropUnacceptable"
									bind:checked={dropBad}
									class="mt-0.5"
								/>
								<span>{t('settings.account.import.leaveThoseOutAndBring')}</span>
							</label>
						</Banner>
					{/if}
				{/if}
				<!--
					Said before the button, in the words of what it does: it empties
					the account and then fills it, so the sentence is the destructive
					one and the confirmation is typed rather than clicked.

					One sentence with the word in it, rather than "Type" + the word +
					"to confirm" as three pieces — assembled, it came out as "Tipo
					SUBSTITUIR para confirmar" in Portuguese.
				-->
				<Banner kind="warning">
					<p>
						{t('settings.account.import.this')}
						<strong>{t('settings.account.import.replacesEverythingInThisAccount')}</strong>
						{t('settings.account.import.withWhatIsInThe')}
					</p>
					<label class="mt-2 block">
						{confirmLabel[0]}<code class="text-xs">{confirmWord}</code>{confirmLabel[1] ?? ''}
						<OneLine name="confirm" class="input mt-1 max-w-[12rem]" />
					</label>
				</Banner>
				<p class="text-xs text-gray-500">
					{t('settings.account.import.dataRelatedToBillingApi')}
					<strong>{t('settings.account.import.not')}</strong>
					{t('settings.account.import.beImportedWhateverYouWrote')}
				</p>
				<!-- Not pressable until a file has been read and understood, nor while
				     the preview names rows the restore would refuse and nobody has
				     answered what to do about them. -->
				<button
					type="submit"
					class="btn btn-danger btn-sm"
					disabled={restoreText === '' ||
						(preview != null && preview.unacceptable.length > 0 && !dropBad)}
				>
					{t('settings.account.import.restore')}
				</button>
				{#if form?.success && form.action === 'importAccount'}
					<Banner kind="success" message={form.message} />
				{/if}
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
		</SettingGroup>
	</RoomSurface>
</div>
