/**
 * The page's handle on the self-contained instance.
 *
 * One worker per page, started on first use, spoken to in matched pairs of
 * messages. Everything above this — the fetch bridge, the demo page — asks
 * through `ask()` and never sees a Worker.
 */
type Reply = { id: number; ok: boolean; result?: unknown; error?: string };

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, (r: Reply) => void>();

function start(): Worker {
	if (worker) return worker;
	worker = new Worker(new URL('./sqlite-worker.ts', import.meta.url), { type: 'module' });
	worker.onmessage = (e: MessageEvent<Reply>) => {
		pending.get(e.data.id)?.(e.data);
		pending.delete(e.data.id);
	};
	// A worker that failed to evaluate never answers anything: without this,
	// every ask() would hang instead of failing with the actual reason.
	worker.onerror = (e) => {
		const error = `The self-contained instance's worker failed: ${e.message} (${e.filename}:${e.lineno})`;
		console.error(error);
		for (const [id, resolve] of pending) resolve({ id, ok: false, error });
		pending.clear();
	};
	return worker;
}

export async function ask<T>(op: string, args?: unknown): Promise<T> {
	const reply = await new Promise<Reply>((resolve) => {
		const id = nextId++;
		pending.set(id, resolve);
		start().postMessage({ id, op, args });
	});
	if (!reply.ok) throw new Error(reply.error);
	return reply.result as T;
}
