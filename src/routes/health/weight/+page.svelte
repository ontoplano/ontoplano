<script lang="ts">
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

	const WIDTH = 900;
	const HEIGHT = 350;
	const PAD = { top: 20, right: 20, bottom: 40, left: 50 };
	const plotW = WIDTH - PAD.left - PAD.right;
	const plotH = HEIGHT - PAD.top - PAD.bottom;

	function buildChart(weights: { date: string; weight: number }[]) {
		if (weights.length === 0) return null;

		const minW = Math.floor(Math.min(...weights.map((w) => w.weight)) - 1);
		const maxW = Math.ceil(Math.max(...weights.map((w) => w.weight)) + 1);

		const firstDate = new Date(weights[0].date + 'T00:00:00');
		const lastDate = new Date(weights[weights.length - 1].date + 'T00:00:00');
		const daySpan = Math.max((lastDate.getTime() - firstDate.getTime()) / 86400000, 1);

		function xFor(dateStr: string): number {
			const d = new Date(dateStr + 'T00:00:00');
			const days = (d.getTime() - firstDate.getTime()) / 86400000;
			return PAD.left + (days / daySpan) * plotW;
		}

		function yFor(w: number): number {
			return PAD.top + plotH - ((w - minW) / (maxW - minW)) * plotH;
		}

		const segments: string[] = [];
		let currentSegment: string[] = [];
		for (let i = 0; i < weights.length; i++) {
			const x = xFor(weights[i].date);
			const y = yFor(weights[i].weight);
			currentSegment.push(
				`${currentSegment.length === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
			);

			if (i < weights.length - 1) {
				const d1 = new Date(weights[i].date + 'T00:00:00');
				const d2 = new Date(weights[i + 1].date + 'T00:00:00');
				const gap = (d2.getTime() - d1.getTime()) / 86400000;
				if (gap > 3) {
					segments.push(currentSegment.join(''));
					currentSegment = [];
				}
			}
		}
		if (currentSegment.length > 0) segments.push(currentSegment.join(''));

		const yTickCount = 6;
		const yTicks: { value: number; y: number }[] = [];
		for (let i = 0; i <= yTickCount; i++) {
			const value = minW + ((maxW - minW) * i) / yTickCount;
			yTicks.push({ value: Math.round(value * 10) / 10, y: yFor(value) });
		}

		const xTickCount = Math.min(8, Math.ceil(daySpan / 7));
		const xTicks: { label: string; x: number }[] = [];
		for (let i = 0; i <= xTickCount; i++) {
			const dayOffset = Math.round((daySpan * i) / xTickCount);
			const d = new Date(firstDate.getTime() + dayOffset * 86400000);
			const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
			xTicks.push({ label, x: PAD.left + (dayOffset / daySpan) * plotW });
		}

		const points = weights.map((w) => ({
			x: xFor(w.date),
			y: yFor(w.weight),
			date: w.date,
			weight: w.weight
		}));

		const latest = weights[weights.length - 1];

		return { segments, yTicks, xTicks, points, latest, minW, maxW };
	}

	const chart = $derived(buildChart(data.weights));
</script>

{#if !chart}
	<div class="border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
		No weight data found. Make sure a-private-plugin is set up at
		<code class="text-xs">~/.local/share/a-private-plugin/weights.db</code>.
	</div>
{:else}
	<div class="space-y-4">
		<div class="flex items-center gap-4">
			<span class="text-sm text-gray-500">
				Latest: <span class="font-medium text-gray-900">{chart.latest.weight.toFixed(1)} kg</span>
				<span class="ml-1 text-xs text-gray-400">({chart.latest.date})</span>
			</span>
			<span class="text-sm text-gray-500">
				{data.weights.length} measurements
			</span>
		</div>

		<div class="overflow-x-auto border border-gray-200 bg-white shadow-sm">
			<svg viewBox="0 0 {WIDTH} {HEIGHT}" class="w-full" style="min-width: 600px">
				{#each chart.yTicks as tick}
					<line
						x1={PAD.left}
						y1={tick.y}
						x2={WIDTH - PAD.right}
						y2={tick.y}
						stroke="#e5e7eb"
						stroke-width="1"
					/>
					<text x={PAD.left - 8} y={tick.y + 4} text-anchor="end" fill="#9ca3af" font-size="11">
						{tick.value}
					</text>
				{/each}

				{#each chart.xTicks as tick}
					<text x={tick.x} y={HEIGHT - 8} text-anchor="middle" fill="#9ca3af" font-size="11">
						{tick.label}
					</text>
				{/each}

				{#each chart.segments as segment}
					<path d={segment} fill="none" stroke="#06b6d4" stroke-width="2" />
				{/each}

				{#each chart.points as pt}
					<circle cx={pt.x} cy={pt.y} r="3" fill="#06b6d4">
						<title>{pt.date}: {pt.weight.toFixed(1)} kg</title>
					</circle>
				{/each}
			</svg>
		</div>
	</div>
{/if}
