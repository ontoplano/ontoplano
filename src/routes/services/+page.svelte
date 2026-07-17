<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageServerData, ActionData } from './$types';

	interface ServiceInfo {
		name: string;
		description: string;
		activeState: string;
		subState: string;
		mainPID: number;
		activeEnterTimestamp: string;
		uptime: string;
		hasTimer: boolean;
		timer: { lastTrigger: string; nextElapse: string } | null;
		logs: string[];
	}

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let selectedIndex = $state(0);
	let expandedService: string | null = $state(null);

	function services(): ServiceInfo[] {
		return data.services as ServiceInfo[];
	}

	function statusColor(state: string, sub: string): string {
		if (state === 'active' && sub === 'running') return 'bg-blue-500';
		if (state === 'active') return 'bg-blue-400';
		if (state === 'activating') return 'bg-amber-400';
		if (state === 'failed') return 'bg-red-500';
		return 'bg-gray-300';
	}

	function statusText(state: string, sub: string): string {
		if (state === 'active' && sub === 'running') return 'running';
		if (state === 'active' && sub === 'auto-restart') return 'restarting';
		if (state === 'activating') return 'activating';
		if (state === 'failed') return 'failed';
		if (state === 'inactive') return 'stopped';
		return `${state}/${sub}`;
	}

	function statusBadgeClass(state: string): string {
		if (state === 'active') return 'border-blue-200 bg-blue-50 text-blue-700';
		if (state === 'activating') return 'border-amber-200 bg-amber-50 text-amber-700';
		if (state === 'failed') return 'border-red-200 bg-red-50 text-red-700';
		return 'border-gray-200 bg-gray-50 text-gray-600';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		const svcs = services();

		switch (e.key) {
			case 'j':
				e.preventDefault();
				selectedIndex = Math.min(selectedIndex + 1, svcs.length - 1);
				break;
			case 'k':
				e.preventDefault();
				selectedIndex = Math.max(selectedIndex - 1, 0);
				break;
			case 'Enter':
				e.preventDefault();
				if (svcs.length > 0) {
					const svc = svcs[selectedIndex];
					expandedService = expandedService === svc.name ? null : svc.name;
				}
				break;
			case 'Escape':
				e.preventDefault();
				expandedService = null;
				break;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-lg font-bold text-gray-900">Services</h1>
		<span class="text-sm text-gray-500">{services().length} units</span>
	</div>

	{#if form?.message}
		<div class="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
			{form.message}
		</div>
	{/if}

	{#if services().length === 0}
		<div class="border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
			No user services found in ~/.config/systemd/user/
		</div>
	{:else}
		<div class="divide-y divide-gray-200 border border-gray-200 bg-white shadow-sm">
			{#each services() as svc, i (svc.name)}
				<div class={i === selectedIndex ? 'ring-2 ring-gray-900 ring-inset' : ''}>
					<div class="flex items-center gap-4 px-4 py-3">
						<div class="h-2.5 w-2.5 shrink-0 {statusColor(svc.activeState, svc.subState)}">
						</div>
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<span class="text-sm font-medium text-gray-900">{svc.name}</span>
								<span
									class="border px-1.5 py-0.5 text-xs font-medium {statusBadgeClass(svc.activeState)}"
								>
									{statusText(svc.activeState, svc.subState)}
								</span>
								{#if svc.uptime}
									<span class="text-xs text-gray-400">up {svc.uptime}</span>
								{/if}
								{#if svc.mainPID > 0}
									<span class="text-xs text-gray-400">PID {svc.mainPID}</span>
								{/if}
							</div>
							{#if svc.description}
								<p class="truncate text-xs text-gray-500">{svc.description}</p>
							{/if}
							{#if svc.timer}
								<div class="mt-0.5 flex gap-3 text-xs text-gray-400">
									{#if svc.timer.lastTrigger}
										<span>last: {svc.timer.lastTrigger}</span>
									{/if}
									{#if svc.timer.nextElapse}
										<span>next: {svc.timer.nextElapse}</span>
									{/if}
								</div>
							{/if}
						</div>
						<div class="flex shrink-0 items-center gap-2">
							{#if svc.activeState === 'active' || svc.activeState === 'activating'}
								<form method="post" action="?/restart" use:enhance>
									<input type="hidden" name="name" value={svc.name} />
									<button
										type="submit"
										class="border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 shadow-sm transition hover:bg-gray-50"
									>
										Restart
									</button>
								</form>
								<form method="post" action="?/stop" use:enhance>
									<input type="hidden" name="name" value={svc.name} />
									<button
										type="submit"
										class="border border-red-200 bg-white px-2 py-1 text-xs text-red-600 shadow-sm transition hover:bg-red-50"
									>
										Stop
									</button>
								</form>
							{:else}
								<form method="post" action="?/start" use:enhance>
									<input type="hidden" name="name" value={svc.name} />
									<button
										type="submit"
										class="border border-blue-200 bg-white px-2 py-1 text-xs text-blue-600 shadow-sm transition hover:bg-blue-50"
									>
										Start
									</button>
								</form>
							{/if}
							<button
								onclick={() => {
									expandedService = expandedService === svc.name ? null : svc.name;
								}}
								class="border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-100"
							>
								{expandedService === svc.name ? 'Hide logs' : 'Logs'}
							</button>
						</div>
					</div>

					{#if expandedService === svc.name}
						<div class="border-t border-gray-200 bg-gray-50 px-4 py-3">
							<div class="mb-1 text-xs font-medium text-gray-500">
								Last {svc.logs.length} log lines
							</div>
							{#if svc.logs.length > 0}
								<pre
									class="max-h-64 overflow-auto font-mono text-xs leading-relaxed text-gray-700 whitespace-pre-wrap">{svc.logs.join('\n')}</pre>
							{:else}
								<p class="text-xs text-gray-400">No logs available</p>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
