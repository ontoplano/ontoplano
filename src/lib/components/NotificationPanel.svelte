<script lang="ts" module>
	/** One thing the app said, as the shell hands it down. */
	export type Sent = {
		id: number;
		title: string;
		body: string;
		url: string | null;
		readAt: string | null;
		createdAt: string;
	};
</script>

<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { useT } from '$lib/i18n';

	/**
	 * The list of what the app has told you.
	 *
	 * One list, two frames: a dropdown under the bell on a wide screen, a
	 * dialog raised from the account fan on a phone. The rows, what a row does
	 * when pressed and what "seen" means are the same in both, which is why
	 * they are here and not in either of them.
	 *
	 * **Being on screen is being read.** The badge answers one question — is
	 * there anything I have not looked at — and looking answers it. A count
	 * that survives being read is a count people stop believing.
	 */
	const t = useT();

	let {
		held,
		unread,
		/** So the frame around this can close itself when a row is followed. */
		onpick
	}: { held: Sent[]; unread: number; onpick?: () => void } = $props();

	async function tell(id?: number) {
		await fetch('/api/notifications', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(id === undefined ? {} : { id })
		});
		// The reply carries the count, but the list is the shell's data — one
		// reload keeps the bell, this panel and the phone's dot agreeing.
		await invalidateAll();
	}

	$effect(() => {
		// Mounted is seen. See the note above.
		if (unread > 0) void tell();
	});

	/** The row's own stamp, which is already the account's wall clock. */
	const when = (iso: string) => iso.replace('T', ' ').slice(0, 16);
</script>

{#if held.length === 0}
	<p class="px-1 py-6 text-sm text-gray-500">{t('notifications.none')}</p>
{:else}
	<ul class="divide-y divide-gray-200">
		{#each held as one (one.id)}
			<li>
				<!--
					A link when it has somewhere to go, a plain row when it does not —
					rather than a link to nowhere, which looks pressable and is not.
				-->
				<svelte:element
					this={one.url ? 'a' : 'div'}
					href={one.url ?? undefined}
					role={one.url ? undefined : 'note'}
					class="block px-1 py-2.5 text-left {one.url ? 'hover:bg-gray-50' : ''}"
					onclick={() => {
						if (one.url) onpick?.();
					}}
				>
					<span class="flex items-start gap-2">
						<!-- The dot stays as a space when read, so a list of them does
						     not shift left and right as they are opened. -->
						<span
							class="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full {one.readAt
								? ''
								: 'bg-red-600'}"
							aria-hidden="true"
						></span>
						<span class="min-w-0 flex-1">
							<span class="block text-sm font-medium text-gray-900">{one.title}</span>
							{#if one.body}
								<span class="mt-0.5 block text-sm leading-relaxed text-gray-600">{one.body}</span>
							{/if}
							<span class="mt-0.5 block text-xs text-gray-500">{when(one.createdAt)}</span>
						</span>
					</span>
				</svelte:element>
			</li>
		{/each}
	</ul>
{/if}

<div class="mt-2 border-t border-gray-200 pt-2">
	<a
		href={resolve('/settings/preferences')}
		class="text-sm text-gray-600 underline underline-offset-2"
		onclick={() => onpick?.()}
	>
		{t('settings.preferences.notifications')}
	</a>
</div>
