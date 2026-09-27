<script lang="ts">
	import FilterBar from '$lib/components/FilterBar.svelte';
	import SearchField from '$lib/components/SearchField.svelte';
	import ShowingCount from '$lib/components/ShowingCount.svelte';
	import SortControl from '$lib/components/SortControl.svelte';
	import { browsable } from '$lib/browse.svelte';
	import { listCursor } from '$lib/actions/list-cursor';
	import type { PlainKey } from '$lib/i18n/keys';
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
	import { momentOf } from '$lib/when';
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
	/** The orders a list of recordings is read in. */
	const ORDERS = ['recorded', 'name', 'length'] as const;
	type Order = (typeof ORDERS)[number];
	const ORDER_LABELS: Record<Order, PlainKey> = {
		recorded: 'audio.orderRecorded',
		name: 'audio.orderName',
		length: 'audio.orderLength'
	};
	let order = $state<Order>('recorded');
	let direction = $state<'asc' | 'desc'>('desc');

	const shown = $derived.by(() => {
		const found =
			needle === ''
				? [...data.recordings]
				: data.recordings.filter((one) => one.name.toLowerCase().includes(needle));
		const sign = direction === 'asc' ? 1 : -1;
		const by: Record<Order, (a: (typeof found)[number], b: (typeof found)[number]) => number> = {
			recorded: (a, b) => a.createdAt.localeCompare(b.createdAt),
			name: (a, b) => a.name.localeCompare(b.name),
			length: (a, b) => (a.seconds ?? 0) - (b.seconds ?? 0)
		};
		return found.sort((a, b) => sign * by[order](a, b));
	});

	/** Where j/k stands, and each row's player so Enter can play it. */
	let at = $state(-1);
	const players = $state<Record<number, { toggle: () => void }>>({});
	let playing = $state<Record<number, boolean>>({});

	browsable(() => ({
		items: () => shown,
		cursor: () => at,
		moveTo: (i) => (at = i),
		open: (i) => players[shown[i].id]?.toggle(),
		edit: (i) => (renaming = shown[i].id)
	}));

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

	/** When it happened, where the reader is, in the app's one date format. */
	const now = useWhen();
	const said = (iso: string) => momentOf(iso, now(), { year: undefined });

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
			{#snippet trailing()}
				<SortControl
					value={order}
					options={ORDERS}
					labels={ORDER_LABELS}
					{direction}
					onpick={(next) => (order = next)}
					onflip={() => (direction = direction === 'asc' ? 'desc' : 'asc')}
					label={t('audio.orderBy')}
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
			{#each shown as one, i (one.id)}
				<li class="list-row" data-row use:listCursor={i === at}>
					<!-- Play stands in the rail, where a task keeps its tick: the one
					     thing a recording is for, first on the row. -->
					<span class="row-rail">
						<button
							type="button"
							class="icon-btn"
							onclick={() => players[one.id]?.toggle()}
							title={playing[one.id] ? t('audio.pausePlayback') : t('audio.play')}
							aria-label={`${playing[one.id] ? t('audio.pausePlayback') : t('audio.play')} ${one.name}`}
						>
							<Icon name={playing[one.id] ? 'pause' : 'play'} />
						</button>
					</span>
					<div class="list-row-main flex flex-wrap items-center gap-x-4 gap-y-1">
						<div class="min-w-0 flex-1 basis-48">
							<p class="truncate text-sm font-medium text-gray-900">{one.name}</p>
							<p class="mt-0.5 text-xs text-gray-500">
								{said(one.createdAt)} · {size(one.byteSize)}
							</p>
						</div>
						<!-- The app's own transport rather than the browser's, which
						     arrives at a fixed size in a grey of its own and reads as a
						     foreign object in the list. See `AudioPlayer`. -->
						<AudioPlayer
							bind:this={players[one.id]}
							onplayingchange={(on) => (playing[one.id] = on)}
							button={false}
							src="/media/audio/{one.id}"
							label={one.name}
							seconds={one.seconds}
							class="w-full sm:w-72"
						/>
					</div>

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
