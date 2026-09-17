<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import Recorder from '$lib/components/Recorder.svelte';
	import RoomToolbar from '$lib/components/RoomToolbar.svelte';
	import { armed } from '$lib/actions/armed';
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

	/** The one being deleted, if any. Asked in a dialog like every other. */
	let doomedId = $state<number | null>(null);
	const doomed = $derived(data.recordings.find((one) => one.id === doomedId) ?? null);

	const full = $derived(data.recordings.length >= data.limits.accountAudios);

	async function keep(bytes: Blob, name: string) {
		const body = new FormData();
		// A name only for the multipart part; the service names the row.
		body.set('file', bytes, 'recording');
		body.set('name', name);

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

	<section class="border border-gray-200 bg-white p-4 shadow-card">
		<Recorder
			kilobytes={data.limits.audioKilobytes}
			atMost={data.limits.accountAudios}
			{full}
			suggestedName={data.suggestedName}
			onsave={keep}
		/>
	</section>

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
									name="name"
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

					<!--
						The player is the browser's own.

						A hand-built transport here would be a second one to keep in
						step with the recorder's, for a row somebody plays and moves
						on from. The controls it draws are the platform's.
					-->
					<audio class="h-8 w-full sm:w-64" controls preload="none" src="/media/audio/{one.id}"
					></audio>

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
