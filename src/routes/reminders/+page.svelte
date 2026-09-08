<script lang="ts">
	import { enhance } from '$app/forms';
	import Card from '$lib/components/Card.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import { armed } from '$lib/actions/armed';
	import type { ActionData, PageServerData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	/**
	 * Everything with a time on it.
	 *
	 * Reminders were scattered — a block carried one, a birthday made one — and
	 * the only way to see what was coming was to wait for it. This is the list,
	 * and the place to set one that is about nothing at all.
	 */
	const KIND_LABELS: Record<string, string> = {
		instance: 'Blocks',
		todo: 'Todos',
		free: 'Alarms',
		review: 'The weekly review',
		bill: 'Bills',
		person: 'Birthdays'
	};

	const upcoming = $derived(data.reminders.filter((r) => !r.dismissedAt));

	function when(at: string): string {
		const d = new Date(at.length === 16 ? at + ':00' : at);
		return d.toLocaleString('en-GB', {
			weekday: 'short',
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	let confirmingDelete = $state<number | null>(null);
	/** Playing one, so choosing a sound does not mean setting an alarm to hear it. */
	let audio: HTMLAudioElement | undefined = $state();

	function preview(url: string) {
		if (!audio) return;
		audio.src = url;
		void audio.play().catch(() => {
			/* a browser that will not play without a gesture is not an error */
		});
	}
</script>

<svelte:head><title>Reminders · Ontoplano</title></svelte:head>

<audio bind:this={audio} class="hidden"></audio>

<div class="space-y-4">
	<h1 class="text-lg font-bold text-gray-900">Reminders</h1>

	<FormError message={form?.message} />

	<!--
		The alarm clock.

		A reminder about nothing: a time and a sentence. It shows wherever
		notifications are on; it only makes a noise if you say so here, because a
		thing that beeps without being asked is a thing whose sound gets turned
		off for good.
	-->
	<div data-tour="set-alarm">
		<Card title="Set one" description="A time and what to say. It is about nothing else.">
			<form method="post" action="?/create" use:enhance class="space-y-3">
				<div class="flex flex-wrap items-end gap-3">
					<label class="flex flex-col gap-1 text-sm text-gray-700">
						When
						<input name="at" type="datetime-local" required autocomplete="off" class="input" />
					</label>
					<label class="flex min-w-48 flex-1 flex-col gap-1 text-sm text-gray-700">
						What to say
						<OneLine name="label" required placeholder="e.g. take the bread out" class="input" />
					</label>
				</div>

				<div class="flex flex-wrap items-center gap-4">
					<label class="flex items-center gap-2 text-sm text-gray-700">
						<input type="checkbox" name="audible" class="size-4" />
						Make a sound
					</label>
					<label class="flex items-center gap-2 text-sm text-gray-700">
						Which
						<select name="ringtoneId" class="select">
							<option value="">The one the app comes with</option>
							{#each data.ringtones as tone (tone.id)}
								<option value={tone.id}>{tone.name}</option>
							{/each}
						</select>
					</label>
					<button type="submit" class="btn btn-primary btn-sm ml-auto">Set it</button>
				</div>
			</form>
		</Card>
	</div>

	<!-- What is coming, soonest first. -->
	<Card title="Coming up" description="Everything set, whatever set it." flush>
		{#if upcoming.length === 0}
			<EmptyState
				icon="clock"
				title="Nothing waiting"
				description="Blocks with a reminder, birthdays, bills and anything you set here all show up in this list."
			/>
		{:else}
			<ul class="divide-y divide-gray-200">
				{#each upcoming as reminder (reminder.id)}
					<li class="flex items-center gap-3 px-4 py-2">
						<span class="shrink-0 text-gray-400"><Icon name="clock" size={14} /></span>
						<span class="min-w-0 flex-1">
							<span class="block truncate text-sm text-gray-900">{reminder.message}</span>
							<span class="text-xs text-gray-500">
								{KIND_LABELS[reminder.subjectKind] ?? reminder.subjectKind}
								{#if reminder.deliveredAt}· already shown{/if}
							</span>
						</span>
						<span class="tabular shrink-0 text-xs text-gray-500">{when(reminder.remindAt)}</span>

						{#if confirmingDelete === reminder.id}
							<form method="post" action="?/remove" use:enhance class="flex shrink-0 gap-1">
								<input type="hidden" name="id" value={reminder.id} />
								<button type="submit" class="btn btn-sm btn-danger" use:armed>Confirm?</button>
								<button type="button" onclick={() => (confirmingDelete = null)} class="btn btn-sm">
									Cancel
								</button>
							</form>
						{:else}
							<button
								type="button"
								onclick={() => (confirmingDelete = reminder.id)}
								class="icon-btn icon-btn-danger shrink-0"
								title="Remove this reminder"
								aria-label="Remove {reminder.message}"
							>
								<Icon name="trash" />
							</button>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</Card>

	<!--
		Which kinds are worth hearing.

		Silent unless asked, for every kind: an alarm probably is worth a noise
		and a birthday probably is not, and that is a judgement nobody else can
		make for you.
	-->
	<div data-tour="reminder-sounds">
		<Card title="What makes a sound" description="Everything shows. Only these are heard." flush>
			<ul class="divide-y divide-gray-200">
				{#each data.sounds as choice (choice.kind)}
					<li class="px-4 py-2">
						<form
							method="post"
							action="?/setSound"
							use:enhance
							class="flex flex-wrap items-center gap-3"
						>
							<input type="hidden" name="kind" value={choice.kind} />
							<span class="min-w-32 flex-1 text-sm text-gray-900">
								{KIND_LABELS[choice.kind] ?? choice.kind}
							</span>
							<label class="flex items-center gap-2 text-sm text-gray-700">
								<input type="checkbox" name="audible" checked={choice.audible} class="size-4" />
								Sound
							</label>
							<select name="ringtoneId" class="select w-56 shrink-0">
								<option value="" selected={choice.ringtoneId === null}>
									The one the app comes with
								</option>
								{#each data.ringtones as tone (tone.id)}
									<option value={tone.id} selected={choice.ringtoneId === tone.id}
										>{tone.name}</option
									>
								{/each}
							</select>
							<button type="submit" class="btn btn-sm">Save</button>
						</form>
					</li>
				{/each}
			</ul>
		</Card>
	</div>

	<!-- The sounds themselves. -->
	<Card
		title="Your sounds"
		description="Up to {data.limits.ringtones}, {data.limits.kilobytes} KB each. MP3, OGG or WAV."
		flush
	>
		{#if data.ringtones.length > 0}
			<ul class="divide-y divide-gray-200">
				{#each data.ringtones as tone (tone.id)}
					<li class="flex items-center gap-3 px-4 py-2">
						<span class="min-w-0 flex-1 truncate text-sm text-gray-900">{tone.name}</span>
						<span class="tabular shrink-0 text-xs text-gray-500">
							{Math.round(tone.bytes / 1024)} KB
						</span>
						<button
							type="button"
							onclick={() => preview(`/api/ringtones/${tone.id}`)}
							class="icon-btn shrink-0"
							title="Hear it"
							aria-label="Hear {tone.name}"
						>
							<Icon name="play" />
						</button>
						<form method="post" action="?/removeSound" use:enhance class="shrink-0">
							<input type="hidden" name="id" value={tone.id} />
							<button
								type="submit"
								class="icon-btn icon-btn-danger"
								title="Remove"
								aria-label="Remove {tone.name}"
								use:armed
							>
								<Icon name="trash" />
							</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}

		<div class="border-t border-gray-200 px-4 py-3">
			<form
				method="post"
				action="?/addSound"
				enctype="multipart/form-data"
				use:enhance
				class="flex flex-wrap items-end gap-3"
			>
				<label class="flex flex-col gap-1 text-sm text-gray-700">
					A sound file
					<!-- Choosing the file is the submit: a second button to press after
					     picking one is a step nobody needs. -->
					<input
						name="sound"
						type="file"
						accept="audio/mpeg,audio/ogg,audio/wav"
						required
						class="text-sm"
						onchange={(e) => (e.currentTarget as HTMLInputElement).form?.requestSubmit()}
					/>
				</label>
				<label class="flex flex-col gap-1 text-sm text-gray-700">
					Call it
					<OneLine name="label" placeholder="optional" class="input" />
				</label>
			</form>
			<p class="mt-2 text-xs text-gray-500">
				Leave the name empty and the file's own name is used.
			</p>
		</div>
	</Card>
</div>
