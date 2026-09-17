<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import AudioPlayer from '$lib/components/AudioPlayer.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import Recorder from '$lib/components/Recorder.svelte';
	import RoomToolbar from '$lib/components/RoomToolbar.svelte';
	import { armed } from '$lib/actions/armed';
	import { setRoomAction } from '$lib/room-action.svelte';
	import { useT } from '$lib/i18n';
	import type { PageData } from './$types';

	/**
	 * Recordings: make one, hear it, name it, keep it.
	 *
	 * The recorder is the page rather than something behind a button, because
	 * making one is the reason to be here — the list underneath is what you come
	 * back for. Everything about the recording itself lives in `Recorder`; this
	 * hands it the ceilings and takes the bytes when it is done.
	 */
	const t = useT();

	let { data }: { data: PageData } = $props();

	/** Which row's name is being edited, if any. One at a time. */
	let renaming = $state<number | null>(null);

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

	async function keep(bytes: Blob, name: string) {
		const body = new FormData();
		// A name only for the multipart part; the service names the row.
		body.set('file', bytes, 'recording');
		body.set('label', name);

		const answer = await fetch('/media/audio', { method: 'POST', body });
		if (!answer.ok) {
			const said = (await answer.json().catch(() => ({}))) as { message?: string };
			throw new Error(said.message ?? t('audio.notSupported'));
		}
		await invalidateAll();
	}

	function when(iso: string): string {
		// The row's own stamp, which is already the account's wall clock.
		return iso.replace('T', ' ').slice(0, 16);
	}

	function size(bytes: number): string {
		return `${Math.max(1, Math.ceil(bytes / 1024))}KB`;
	}
</script>

<div class="space-y-4">
	<RoomToolbar>
		{#snippet tools()}
			<span class="text-sm text-gray-500">
				{t('audio.held', { count: data.recordings.length })}
			</span>
		{/snippet}
	</RoomToolbar>

	{#if data.recordings.length === 0}
		<EmptyState icon="sound" title={t('audio.none')} />
	{:else}
		<ul class="divide-y divide-gray-200 border border-gray-200 bg-white shadow-card">
			{#each data.recordings as one (one.id)}
				<li class="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-4">
					<div class="min-w-0 flex-1">
						{#if renaming === one.id}
							<form
								method="post"
								action="?/rename"
								class="flex flex-wrap items-center gap-2"
								use:enhance={() => {
									return async ({ update }) => {
										renaming = null;
										await update();
									};
								}}
							>
								<input type="hidden" name="id" value={one.id} />
								<OneLine
									name="label"
									value={one.name}
									class="input w-auto flex-1 sm:max-w-72"
									ariaLabel={t('audio.nameIt')}
									required
								/>
								<button class="btn btn-sm btn-primary" type="submit">{t('ui.save')}</button>
								<button
									type="button"
									class="btn btn-sm btn-quiet"
									onclick={() => (renaming = null)}
								>
									{t('ui.cancel')}
								</button>
							</form>
						{:else}
							<p class="truncate text-sm font-medium text-gray-900">{one.name}</p>
							<p class="mt-0.5 text-xs text-gray-500">
								{when(one.createdAt)} · {size(one.byteSize)}
							</p>
						{/if}
					</div>

					<!-- The app's own transport rather than the browser's, which
					     arrives at a fixed size in a grey of its own and reads as a
					     foreign object in the list. See `AudioPlayer`. -->
					<AudioPlayer src="/media/audio/{one.id}" label={one.name} class="w-full sm:w-72" />

					<div class="flex shrink-0 items-center gap-2">
						<button
							type="button"
							class="btn btn-sm"
							onclick={() => (renaming = renaming === one.id ? null : one.id)}
						>
							<Icon name="edit" class="mr-1.5" />
							{t('audio.rename')}
						</button>
						<button type="button" class="btn btn-sm btn-danger" onclick={() => (doomedId = one.id)}>
							<Icon name="trash" class="mr-1.5" />
							{t('audio.delete')}
						</button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>

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
