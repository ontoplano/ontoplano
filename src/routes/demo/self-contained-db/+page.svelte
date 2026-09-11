<script lang="ts">
	import { onMount } from 'svelte';

	let vfs = $state('…');
	let todos = $state(-1);
	let latest = $state('');
	let persisted = $state('…');
	let error = $state('');

	onMount(async () => {
		persisted = String(await navigator.storage?.persist?.());

		const worker = new Worker(new URL('$lib/self-contained/sqlite-worker.ts', import.meta.url), {
			type: 'module'
		});

		let nextId = 0;
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- request bookkeeping, not state the page renders
		const pending = new Map<number, (r: unknown) => void>();
		worker.onmessage = (e) => {
			pending.get(e.data.id)?.(e.data);
			pending.delete(e.data.id);
		};
		const ask = (op: string, args?: unknown) =>
			new Promise<{ ok: boolean; result?: unknown; error?: string }>((resolve) => {
				const id = nextId++;
				pending.set(id, resolve as (r: unknown) => void);
				worker.postMessage({ id, op, args });
			});

		const status = await ask('status');
		if (!status.ok) {
			error = status.error ?? '';
			todos = -2;
			return;
		}
		vfs = (status.result as { vfs: string }).vfs;

		const made = await ask('todos.create', { title: `written on the device` });
		if (!made.ok) {
			error = made.error ?? '';
			todos = -2;
			return;
		}
		const list = await ask('todos.list');
		if (!list.ok) {
			error = list.error ?? '';
			todos = -2;
			return;
		}
		const rows = list.result as { title: string }[];
		todos = rows.length;
		latest = rows[0]?.title ?? '';
	});
</script>

<p data-testid="vfs">{vfs}</p>
<p data-testid="todos">{todos}</p>
<p data-testid="latest">{latest}</p>
<p data-testid="persisted">{persisted}</p>
<p data-testid="error">{error}</p>
