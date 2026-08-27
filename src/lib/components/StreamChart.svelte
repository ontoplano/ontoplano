<script lang="ts">
	import EmptyState from '$lib/components/EmptyState.svelte';

	/**
	 * Generic renderers for data streams.
	 *
	 * Deliberately dependency-free inline SVG: producers never ship frontend
	 * code, so every stream in the app is drawn by this one component. Colours
	 * follow the project palette — blue for signal, gray for neutral, and no
	 * red/green pairing (the author is red-green colourblind).
	 */
	interface Point {
		external_id: string;
		at: string;
		local_date: string;
		value: number | string | null;
		meta: Record<string, unknown>;
	}

	let {
		points,
		display,
		unit = ''
	}: {
		points: Point[];
		display: 'line_chart' | 'calendar_heatmap' | 'latest_value' | 'bar_chart' | 'list';
		unit?: string;
	} = $props();

	const WIDTH = 720;
	const HEIGHT = 220;
	const PAD = { top: 12, right: 12, bottom: 24, left: 44 };

	const numeric = $derived(
		points
			.filter((p): p is Point & { value: number } => typeof p.value === 'number')
			.slice()
			.sort((a, b) => a.at.localeCompare(b.at))
	);

	const bounds = $derived.by(() => {
		if (numeric.length === 0) return null;
		const values = numeric.map((p) => p.value);
		const times = numeric.map((p) => new Date(p.at).getTime());
		let min = Math.min(...values);
		let max = Math.max(...values);
		if (min === max) {
			min -= 1;
			max += 1;
		}
		const padding = (max - min) * 0.08;
		return {
			minValue: min - padding,
			maxValue: max + padding,
			minTime: Math.min(...times),
			maxTime: Math.max(...times)
		};
	});

	function x(at: string): number {
		if (!bounds) return PAD.left;
		const span = bounds.maxTime - bounds.minTime || 1;
		const t = (new Date(at).getTime() - bounds.minTime) / span;
		return PAD.left + t * (WIDTH - PAD.left - PAD.right);
	}

	function y(value: number): number {
		if (!bounds) return HEIGHT - PAD.bottom;
		const span = bounds.maxValue - bounds.minValue || 1;
		const t = (value - bounds.minValue) / span;
		return HEIGHT - PAD.bottom - t * (HEIGHT - PAD.top - PAD.bottom);
	}

	const linePath = $derived(
		numeric.length === 0
			? ''
			: numeric.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.at)},${y(p.value)}`).join(' ')
	);

	const yTicks = $derived.by(() => {
		if (!bounds) return [];
		const steps = 4;
		return Array.from({ length: steps + 1 }, (_, i) => {
			const value = bounds.minValue + ((bounds.maxValue - bounds.minValue) * i) / steps;
			return { value, y: y(value) };
		});
	});

	const latest = $derived(numeric.length > 0 ? numeric[numeric.length - 1] : null);
	const previous = $derived(numeric.length > 1 ? numeric[numeric.length - 2] : null);
	const delta = $derived(latest && previous ? latest.value - previous.value : null);

	// --- Calendar heatmap ---

	// Plain object rather than a Map: `svelte/prefer-svelte-reactivity` flags
	// mutable built-ins, and these are pure derived values that never need to be
	// reactive containers themselves.
	const byDate = $derived.by(() => {
		const counts: Record<string, number> = {};
		for (const p of points) counts[p.local_date] = (counts[p.local_date] ?? 0) + 1;
		return counts;
	});

	const DAY_MS = 86400_000;

	function isoDate(ms: number): string {
		const d = new Date(ms);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}

	const heatmapWeeks = $derived.by(() => {
		const today = new Date();
		const endMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
		// Align the start to the Monday on or before a year ago, so every column
		// is a whole week.
		const roughStart = endMs - 364 * DAY_MS;
		const startDow = (new Date(roughStart).getDay() + 6) % 7;
		const startMs = roughStart - startDow * DAY_MS;

		const days: { date: string; count: number }[] = [];
		for (let ms = startMs; ms <= endMs; ms += DAY_MS) {
			const date = isoDate(ms);
			days.push({ date, count: byDate[date] ?? 0 });
		}

		const weeks: { date: string; count: number }[][] = [];
		for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
		return weeks;
	});

	function heatColor(count: number): string {
		if (count === 0) return '#f3f4f6';
		if (count === 1) return '#bfdbfe';
		if (count === 2) return '#60a5fa';
		if (count === 3) return '#3b82f6';
		return '#1d4ed8';
	}

	// --- Bar chart (counts per day, most recent 30) ---

	const bars = $derived.by(() => {
		const recent = Object.entries(byDate)
			.sort((a, b) => a[0].localeCompare(b[0]))
			.slice(-30);
		const max = Math.max(1, ...recent.map(([, c]) => c));
		return recent.map(([date, count]) => ({ date, count, height: (count / max) * 100 }));
	});

	function formatValue(v: number): string {
		return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, '');
	}
</script>

{#if points.length === 0}
	<EmptyState
		icon="plug"
		title="No data yet"
		description="Once the app producing this stream pushes points, they appear here."
	/>
{:else if display === 'line_chart'}
	{#if numeric.length === 0}
		<EmptyState
			icon="plug"
			title="Nothing here can be charted"
			description="This stream has no numeric values in it."
		/>
	{:else}
		<div class="overflow-x-auto p-4">
			<svg viewBox="0 0 {WIDTH} {HEIGHT}" class="h-auto w-full min-w-[480px]" role="img">
				{#each yTicks as tick (tick.value)}
					<line
						x1={PAD.left}
						y1={tick.y}
						x2={WIDTH - PAD.right}
						y2={tick.y}
						stroke="#e5e7eb"
						stroke-width="1"
					/>
					<text x={PAD.left - 6} y={tick.y + 4} text-anchor="end" font-size="10" fill="#6b7280">
						{formatValue(tick.value)}
					</text>
				{/each}
				<path d={linePath} fill="none" stroke="#3b82f6" stroke-width="2" />
				{#each numeric as p (p.external_id)}
					<circle cx={x(p.at)} cy={y(p.value)} r="2.5" fill="#1d4ed8">
						<title>{p.local_date}: {formatValue(p.value)} {unit}</title>
					</circle>
				{/each}
			</svg>
		</div>
	{/if}
{:else if display === 'latest_value'}
	<div class="px-4 py-6">
		{#if latest}
			<p class="text-3xl font-bold text-gray-900">
				{formatValue(latest.value)}<span class="ml-1 text-lg font-normal text-gray-500">{unit}</span
				>
			</p>
			<p class="mt-1 text-sm text-gray-500">
				{latest.local_date}
				{#if delta !== null}
					· <span class={delta === 0 ? 'text-gray-500' : 'text-blue-700'}>
						{delta > 0 ? '+' : ''}{formatValue(delta)}
						{unit} since previous
					</span>
				{/if}
			</p>
		{:else}
			<p class="text-sm text-gray-500">No numeric value recorded.</p>
		{/if}
	</div>
{:else if display === 'calendar_heatmap'}
	<div class="overflow-x-auto p-4">
		<div class="flex gap-[3px]">
			{#each heatmapWeeks as week, wi (wi)}
				<div class="flex flex-col gap-[3px]">
					{#each week as day (day.date)}
						<div
							class="h-3 w-3"
							style="background-color: {heatColor(day.count)}"
							title="{day.date}: {day.count} {day.count === 1 ? 'point' : 'points'}"
						></div>
					{/each}
				</div>
			{/each}
		</div>
		<div class="mt-3 flex items-center gap-2 text-xs text-gray-500">
			<span>Less</span>
			{#each [0, 1, 2, 3, 4] as level (level)}
				<div class="h-3 w-3" style="background-color: {heatColor(level)}"></div>
			{/each}
			<span>More</span>
		</div>
	</div>
{:else if display === 'bar_chart'}
	<div class="overflow-x-auto p-4">
		<div class="flex h-32 min-w-[480px] items-end gap-1">
			{#each bars as bar (bar.date)}
				<div
					class="flex-1 bg-blue-500"
					style="height: {bar.height}%"
					title="{bar.date}: {bar.count}"
				></div>
			{/each}
		</div>
	</div>
{:else}
	<ul class="divide-y divide-gray-200">
		{#each points.slice().reverse().slice(0, 200) as p (p.external_id)}
			<li class="flex items-center gap-4 px-4 py-3">
				<span class="w-40 shrink-0 font-mono text-xs text-gray-500">
					{p.at.slice(0, 16).replace('T', ' ')}
				</span>
				<span class="flex-1 text-sm text-gray-900">
					{p.value ?? '—'}
					{#if typeof p.value === 'number' && unit}<span class="text-gray-500"> {unit}</span>{/if}
				</span>
			</li>
		{/each}
	</ul>
{/if}
