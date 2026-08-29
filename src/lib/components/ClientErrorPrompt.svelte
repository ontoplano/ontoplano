<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';

	/**
	 * The ask, and the sending, for client-side errors.
	 *
	 * Mounted only when the instance has error reporting on. Nothing leaves the
	 * browser until the person has said yes, once; a no is also remembered and
	 * never asked again. Only what broke is sent — message, stack, path — never
	 * anything they wrote.
	 */
	let { state: initial }: { state: 'ask' | 'yes' | 'no' } = $props();

	type Report = { message: string; stack?: string; url: string };

	let decision = $state(initial);
	let pending = $state<Report | null>(null);
	// A page stuck in an error loop must not turn the log into its victim.
	let sent = 0;

	async function post(body: Record<string, unknown>) {
		try {
			await fetch('/api/client-errors', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
		} catch {
			// Reporting must never become its own error.
		}
	}

	function report(message: string, stack?: string) {
		if (decision === 'no' || sent >= 3) return;
		const error: Report = {
			message: message.slice(0, 500),
			stack: stack?.slice(0, 8000),
			url: location.pathname
		};
		if (decision === 'yes') {
			sent += 1;
			void post({ error });
		} else if (!pending) {
			pending = error;
		}
	}

	function choose(answer: 'yes' | 'no') {
		decision = answer;
		void post({ decision: answer });
		if (answer === 'yes' && pending) {
			sent += 1;
			void post({ error: pending });
		}
		pending = null;
	}

	$effect(() => {
		const onError = (event: ErrorEvent) => {
			report(event.message || 'Unknown error', (event.error as Error | undefined)?.stack);
		};
		const onRejection = (event: PromiseRejectionEvent) => {
			const reason = event.reason;
			report(
				reason instanceof Error ? reason.message : String(reason ?? 'Unhandled rejection'),
				reason instanceof Error ? reason.stack : undefined
			);
		};
		window.addEventListener('error', onError);
		window.addEventListener('unhandledrejection', onRejection);
		return () => {
			window.removeEventListener('error', onError);
			window.removeEventListener('unhandledrejection', onRejection);
		};
	});
</script>

{#if pending && decision === 'ask'}
	<div
		class="fixed inset-x-0 bottom-20 z-50 flex flex-col items-center px-4 lg:bottom-6 lg:left-auto lg:items-end lg:px-6"
	>
		<div
			class="w-full max-w-sm border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white shadow-overlay"
			role="alertdialog"
			aria-label="Send error details?"
		>
			<p class="flex items-start gap-2">
				<Icon name="error" size={16} />
				<span>
					Something went wrong on this page. Send the technical details here, so it can be fixed?
					Only what broke is sent — never what you wrote.
				</span>
			</p>
			<div class="mt-3 flex justify-end gap-3">
				<button
					onclick={() => choose('no')}
					class="font-medium text-gray-300 underline underline-offset-2"
				>
					Never
				</button>
				<button
					onclick={() => choose('yes')}
					class="font-medium text-white underline underline-offset-2"
				>
					Send, now and next time
				</button>
			</div>
		</div>
	</div>
{/if}
