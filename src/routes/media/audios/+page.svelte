<script lang="ts">
	import FilterBar from '$lib/components/FilterBar.svelte';
	import SearchField from '$lib/components/SearchField.svelte';
	import ShowingCount from '$lib/components/ShowingCount.svelte';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import Field from '$lib/components/Field.svelte';
	import { routeGlyph } from '$lib/glyphs';
	import { enhance } from '$lib/enhance';
	import { invalidateAll } from '$app/navigation';
	import AudioPlayer from '$lib/components/AudioPlayer.svelte';
	import Banner from '$lib/components/Banner.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import Recorder from '$lib/components/Recorder.svelte';
	import { armed } from '$lib/actions/armed';
	import { setRoomAction } from '$lib/room-action.svelte';
	import { useT } from '$lib/i18n';
	import { instantInWords } from '$lib/services/time';
	import { useWhen } from '$lib/when-context.svelte';
	import { audioMarkdown } from '$lib/audio-markdown';
	import IdeaFields from '$lib/components/fields/IdeaFields.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import type { ActionData, PageData } from './$types';

	/**
	 * Recordings: make one, hear it, name it, keep it.
	 *
	 * The recorder is the page rather than something behind a button, because
	 * making one is the reason to be here — the list underneath is what you come
	 * back for. Everything about the recording itself lives in `Recorder`; this
	 * hands it the ceilings and takes the bytes when it is done.
	 */
	const t = useT();

	let { data, form }: { data: PageData; form: ActionData } = $props();

	/**
	 * The recording somebody is turning into an idea, if any. Null until asked.
	 *
	 * The composer is a dialog, so it is opened by a press and never by
	 * finishing a recording: this page is where somebody makes five in a row,
	 * and a modal that arrives after each one is five dialogs to dismiss —
	 * standing over the list while they are trying to rename the thing they
	 * just made. What finishing a recording does is `justMade` below.
	 */
	let ideaOf = $state<{ id: number; name: string } | null>(null);

	/**
	 * The one just recorded, offered rather than demanded.
	 *
	 * The moment it is finished is when there is still something to say about
	 * it — going to Ideas afterwards and reaching back for the file is three
	 * steps between a thought and writing it down. So the offer is here, in a
	 * strip above the list that blocks nothing and can be waved away. The same
	 * button is on every row, so an old recording is not a lesser one.
	 */
	let justMade = $state<{ id: number; name: string } | null>(null);
	const ideaSeed = $derived(ideaOf ? audioMarkdown(ideaOf.id, ideaOf.name) + '\n' : '');

	/** Which recording's name is being edited, if any. */
	let renaming = $state<number | null>(null);
	const renamingOne = $derived(data.recordings.find((one) => one.id === renaming) ?? null);

	/** Finding one by name. */
	let looking = $state('');
	const needle = $derived(looking.trim().toLowerCase());
	const shown = $derived(
		needle === ''
			? data.recordings
			: data.recordings.filter((one) => one.name.toLowerCase().includes(needle))
	);

	/**
	 * Recording lives where every room's "new something" lives.
	 *
	 * It was a Record button inside a card at the top of the list — a second
	 * place to look for the one thing this tab is for, while the room's own
	 * action slot beside the title sat empty. The gallery puts New album there;
	 * this puts Record.
	 */
	let recording = $state(false);
	let started = $state(false);

	setRoomAction(() => ({
		label: t('audio.record'),
		run: () => {
			started = false;
			recording = true;
		}
	}));

	/** The one being deleted, if any. Asked in a dialog like every other. */
	let doomedId = $state<number | null>(null);
	const doomed = $derived(data.recordings.find((one) => one.id === doomedId) ?? null);

	const full = $derived(data.recordings.length >= data.limits.accountAudios);

	async function keep(bytes: Blob, name: string, seconds: number) {
		const body = new FormData();
		// A name only for the multipart part; the service names the row.
		body.set('file', bytes, 'recording');
		body.set('label', name);
		body.set('seconds', String(seconds));

		const answer = await fetch('/media/audio', { method: 'POST', body });
		const said = (await answer.json().catch(() => ({}))) as {
			id?: number;
			name?: string;
			message?: string;
		};
		if (!answer.ok) throw new Error(said.message ?? t('audio.notSupported'));
		await invalidateAll();
		// Offered once, here, while the thought is still in the room.
		if (said.id) justMade = { id: said.id, name: said.name ?? name };
	}

	/** When it happened, where the reader is. `$lib/services/time.ts` has why. */
	const now = useWhen();
	const said = (iso: string) => instantInWords(iso, now());

	function size(bytes: number): string {
		return t('audio.sizeKB', { size: Math.max(1, Math.ceil(bytes / 1024)) });
	}
</script>

<!--
	One surface: finding one along its top, the offer a new recording makes
	under that, and the recordings edge to edge.
-->
<RoomSurface>
	{#snippet tools()}
		<!-- Nothing here to narrow by but a name: a strip with no filters. -->
		<FilterBar name="audios">
			{#snippet lead()}
				<SearchField bind:value={looking} label={t('audio.searchRecordings')} />
			{/snippet}
			{#snippet count()}
				<ShowingCount
					total={data.recordings.length}
					shown={shown.length}
					said={(count) => t('audio.held', { count })}
				/>
			{/snippet}
		</FilterBar>
	{/snippet}

	<!--
		Just recorded: the offer, not a demand.

		Reserved nothing and blocks nothing — it appears because the list it sits
		above has just grown by a row, which is the one kind of movement this app
		allows. Waved away with the ×, and the row's own button says the same
		thing for ever afterwards.
	-->
	{#if justMade}
		<div class="border-b border-gray-200 px-4 py-3">
			<Banner kind="info">
				<div class="flex flex-wrap items-center gap-2">
					<span class="min-w-0 flex-1">{t('audio.justRecorded', { name: justMade.name })}</span>
					<button
						type="button"
						class="btn btn-sm"
						onclick={() => {
							ideaOf = justMade;
							justMade = null;
						}}
					>
						<Icon name="ideas" />
						{t('audio.makeAnIdea')}
					</button>
					<button
						type="button"
						class="icon-btn"
						title={t('ui.dismiss')}
						aria-label={t('ui.dismiss')}
						onclick={() => (justMade = null)}
					>
						<Icon name="close" />
					</button>
				</div>
			</Banner>
		</div>
	{/if}

	{#if data.recordings.length === 0}
		<EmptyState
			icon={routeGlyph('/media/audios')!}
			title={t('audio.none')}
			description={t('audio.noneDescription')}
		/>
	{:else if shown.length === 0}
		<EmptyState filtered onclear={() => (looking = '')} description={t('audio.noneMatch')} />
	{:else}
		<ul class="divide-y divide-gray-200">
			{#each shown as one (one.id)}
				<li class="list-row flex-wrap">
					<div class="list-row-main min-w-0 flex-1">
						<p class="truncate text-sm font-medium text-gray-900">{one.name}</p>
						<p class="mt-0.5 text-xs text-gray-500">
							{said(one.createdAt)} · {size(one.byteSize)}
						</p>
					</div>

					<!-- The app's own transport rather than the browser's, which
					     arrives at a fixed size in a grey of its own and reads as a
					     foreign object in the list. See `AudioPlayer`. -->
					<AudioPlayer
						src="/media/audio/{one.id}"
						label={one.name}
						seconds={one.seconds}
						class="order-last w-full sm:order-none sm:w-72"
					/>

					<div class="list-row-actions">
						<button
							type="button"
							class="icon-btn"
							title={t('audio.makeAnIdea')}
							aria-label={t('audio.makeAnIdea')}
							onclick={() => (ideaOf = { id: one.id, name: one.name })}
						>
							<Icon name="ideas" />
						</button>
						<button
							type="button"
							class="icon-btn"
							title={t('audio.rename')}
							aria-label={t('audio.renameName', { name: one.name })}
							onclick={() => (renaming = one.id)}
						>
							<Icon name="edit" />
						</button>
						<button
							type="button"
							class="icon-btn icon-btn-danger"
							title={t('audio.delete')}
							aria-label={t('audio.deleteName', { name: one.name })}
							onclick={() => (doomedId = one.id)}
						>
							<Icon name="trash" />
						</button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</RoomSurface>

<!-- A new name, in a dialog like every other form here. -->
<Modal
	open={renamingOne !== null}
	title={t('audio.rename')}
	error={form?.message}
	onclose={() => (renaming = null)}
	size="sm"
>
	{#if renamingOne}
		<form
			id="audio-rename-form"
			method="post"
			action="?/rename"
			use:enhance={() =>
				async ({ result, update }) => {
					await update();
					if (result.type === 'success') renaming = null;
				}}
		>
			<input type="hidden" name="id" value={renamingOne.id} />
			<FormGrid>
				<Field label={t('audio.nameIt')}>
					<OneLine name="label" value={renamingOne.name} class="input w-full" required autofocus />
				</Field>
			</FormGrid>
		</form>
	{/if}
	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (renaming = null)}>{t('ui.cancel')}</button>
		<button type="submit" form="audio-rename-form" class="btn btn-primary">{t('ui.save')}</button>
	{/snippet}
</Modal>

<!-- The same centred stage the wheel raises. Recording is the only thing
     anybody is doing while it runs. -->
{#if recording}
	<div
		class="recorder-stage {started ? '' : 'invisible'}"
		role="group"
		aria-label={t('audio.record')}
	>
		<div>
			<Recorder
				autostart
				kilobytes={data.limits.audioKilobytes}
				atMost={data.limits.accountAudios}
				{full}
				suggestedName={data.suggestedName}
				onsave={keep}
				onstarted={() => (started = true)}
				onfail={() => (recording = false)}
				ondone={() => (recording = false)}
			/>
		</div>
	</div>
{/if}

<!--
	A recording, as an idea.

	The composer is the ideas room's own fields, not a lesser copy of them, so
	tags and the rest are here too. The link to the recording is already in the
	box: it is an ordinary markdown link, which is what the note and idea forms
	write, so an export or another editor still shows something that works.
-->
<Modal
	open={ideaOf !== null}
	title={t('audio.makeAnIdea')}
	description={ideaOf?.name ?? ''}
	error={form?.message}
	onclose={() => (ideaOf = null)}
	size="sm"
>
	{#if ideaOf}
		<AudioPlayer src="/media/audio/{ideaOf.id}" label={ideaOf.name} class="mb-3 w-full" />
		<form
			id="audio-idea-form"
			method="post"
			action="?/toIdea"
			use:enhance={() =>
				async ({ result, update }) => {
					await update({ reset: false });
					if (result.type === 'success') ideaOf = null;
				}}
		>
			<FormGrid>
				<IdeaFields content={ideaSeed} compact />
			</FormGrid>
		</form>
	{/if}

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (ideaOf = null)}>{t('ui.notNow')}</button>
		<button type="submit" form="audio-idea-form" class="btn btn-primary"
			>{t('audio.keepTheIdea')}</button
		>
	{/snippet}
</Modal>

<FormError message={form?.message} />

<!--
	Asked before it happens, the way every other deletion in the app is.

	`armed` on the confirm button and nothing else would be a single click with
	a 450ms fuse, which is not a question — it is the same button being harder
	to press. The dialog is the question; `armed` keeps it from being answered
	by the tap that opened it.
-->
<Modal
	open={doomedId !== null}
	title={t('audio.deleteAsk')}
	description={doomed?.name ?? ''}
	onclose={() => (doomedId = null)}
>
	<p class="text-sm text-gray-600">{t('audio.deleteForever')}</p>

	{#snippet footer()}
		<button class="btn" type="button" onclick={() => (doomedId = null)}>{t('ui.cancel')}</button>
		<form
			method="post"
			action="?/remove"
			use:enhance={() =>
				({ result, update }) => {
					if (result.type === 'success') doomedId = null;
					return update();
				}}
		>
			<input type="hidden" name="id" value={doomedId} />
			<button class="btn btn-danger" type="submit" use:armed>{t('audio.delete')}</button>
		</form>
	{/snippet}
</Modal>
