<script lang="ts">
	/**
	 * A clock you touch, rather than four digits you type.
	 *
	 * `<input type="time">` on a phone is a row of typeable segments with a
	 * small clock beside it. `showPicker()` opens the platform's own picker, but
	 * which *mode* that opens in — the dial, or a numeric keypad — is Android's
	 * choice and it remembers whatever was used last. There is no web API that
	 * asks for the dial, so a time field that is always the dial has to be one.
	 *
	 * ## The native input is still here
	 *
	 * Visually hidden, focusable, and the thing the form actually posts. That is
	 * deliberate: it keeps the field keyboard-operable and legible to a screen
	 * reader, both of which a hand-drawn circle is not, and it means the value
	 * travels the ordinary way with no wiring at the call site. The dial writes
	 * into it and is `aria-hidden` — one control, two ways to work it.
	 *
	 * ## How it behaves
	 *
	 * Hours first, on two rings because a day has twenty-four of them: 00–11
	 * outside, 12–23 inside, midnight at the top of each. Picking one moves to
	 * minutes, which are continuous — the labels are the fives, but anywhere on
	 * the ring is a minute, because "twenty past seven" and "7:22" are both
	 * things people mean.
	 *
	 * Dragging works the whole time; the value follows the finger and settles
	 * where it is lifted.
	 */
	let {
		value = $bindable(''),
		name,
		required = false,
		id
	}: {
		/** `HH:MM`, empty for unset. */
		value?: string;
		name: string;
		required?: boolean;
		id?: string;
	} = $props();

	type Half = 'hour' | 'minute';
	let picking = $state<Half>('hour');

	const parsed = $derived(/^(\d{2}):(\d{2})$/.exec(value));
	const hour = $derived(parsed ? Number(parsed[1]) : null);
	const minute = $derived(parsed ? Number(parsed[2]) : null);

	const pad = (n: number) => String(n).padStart(2, '0');

	function set(h: number | null, m: number | null) {
		value = `${pad(h ?? hour ?? 0)}:${pad(m ?? minute ?? 0)}`;
	}

	/* ── The face ─────────────────────────────────────────────────────────── */

	const SIZE = 260;
	const CENTRE = SIZE / 2;
	const OUTER = 104;
	const INNER = 66;
	/** Between the rings: further than this from the centre is the outer one. */
	const RING_EDGE = (OUTER + INNER) / 2;

	/** Where a value sits on the face, in SVG coordinates. */
	function at(index: number, radius: number): { x: number; y: number } {
		const radians = ((index * 30 - 90) * Math.PI) / 180;
		return { x: CENTRE + radius * Math.cos(radians), y: CENTRE + radius * Math.sin(radians) };
	}

	const OUTER_HOURS = Array.from({ length: 12 }, (_, i) => i);
	const INNER_HOURS = Array.from({ length: 12 }, (_, i) => i + 12);
	const MINUTE_MARKS = Array.from({ length: 12 }, (_, i) => i * 5);

	/** Where the hand points, and how long it is. */
	const hand = $derived.by(() => {
		if (picking === 'minute') {
			return { ...at((minute ?? 0) / 5, OUTER), radius: OUTER };
		}
		const h = hour ?? 0;
		const radius = h < 12 ? OUTER : INNER;
		return { ...at(h % 12, radius), radius };
	});

	/* ── Touching it ──────────────────────────────────────────────────────── */

	let face: SVGSVGElement | undefined = $state();
	let dragging = $state(false);

	/**
	 * What is under the pointer, in the dial's own coordinates.
	 *
	 * Read from the element's box rather than from the event's offset, because
	 * offset is relative to whatever child was hit — a number, a ring, the
	 * background — and the answer has to be about the face.
	 */
	function pointAt(event: PointerEvent): { angle: number; distance: number } | null {
		if (!face) return null;
		const box = face.getBoundingClientRect();
		const scale = SIZE / box.width;
		const x = (event.clientX - box.left) * scale - CENTRE;
		const y = (event.clientY - box.top) * scale - CENTRE;

		// Clockwise from midnight, which is how a clock is read and not how
		// atan2 answers.
		const angle = (Math.atan2(y, x) * 180) / Math.PI + 90;
		return { angle: (angle + 360) % 360, distance: Math.hypot(x, y) };
	}

	function apply(event: PointerEvent) {
		const point = pointAt(event);
		if (!point) return;

		if (picking === 'hour') {
			const twelve = Math.round(point.angle / 30) % 12;
			set(point.distance > RING_EDGE ? twelve : twelve + 12, null);
		} else {
			set(null, Math.round(point.angle / 6) % 60);
		}
	}

	function down(event: PointerEvent) {
		dragging = true;
		face?.setPointerCapture(event.pointerId);
		apply(event);
	}

	function move(event: PointerEvent) {
		if (dragging) apply(event);
	}

	function up(event: PointerEvent) {
		if (!dragging) return;
		dragging = false;
		face?.releasePointerCapture(event.pointerId);
		// Picking an hour is not the end of saying a time, so it moves on by
		// itself — the same thing every clock picker does, and the reason the
		// whole interaction is two taps rather than four.
		if (picking === 'hour') picking = 'minute';
	}
</script>

<div class="w-full max-w-[17rem]">
	<!--
		The readout doubles as the switch: the half you are setting is the lit
		one, and tapping the other half goes back to it.
	-->
	<div class="mb-2 flex items-baseline gap-1">
		<button
			type="button"
			onclick={() => (picking = 'hour')}
			aria-pressed={picking === 'hour'}
			title="Set the hour"
			class="tabular px-1 text-3xl leading-none font-semibold {picking === 'hour'
				? 'text-gray-900'
				: 'text-gray-500 hover:text-gray-700'}"
		>
			{hour === null ? '--' : pad(hour)}
		</button>
		<span class="text-3xl leading-none font-semibold text-gray-500">:</span>
		<button
			type="button"
			onclick={() => (picking = 'minute')}
			aria-pressed={picking === 'minute'}
			title="Set the minutes"
			class="tabular px-1 text-3xl leading-none font-semibold {picking === 'minute'
				? 'text-gray-900'
				: 'text-gray-500 hover:text-gray-700'}"
		>
			{minute === null ? '--' : pad(minute)}
		</button>
		<span class="ml-auto self-center text-xs text-gray-500">
			{picking === 'hour' ? 'hour' : 'minutes'}
		</span>
	</div>

	<!-- The dial itself carries no semantics: the input below is the control. -->
	<svg
		bind:this={face}
		viewBox="0 0 {SIZE} {SIZE}"
		class="w-full touch-none select-none"
		aria-hidden="true"
		onpointerdown={down}
		onpointermove={move}
		onpointerup={up}
		onpointercancel={up}
	>
		<circle cx={CENTRE} cy={CENTRE} r={OUTER + 22} class="fill-gray-100" />

		{#if value}
			{@const tip = hand}
			<line
				x1={CENTRE}
				y1={CENTRE}
				x2={tip.x}
				y2={tip.y}
				class="stroke-gray-900"
				stroke-width="2"
				stroke-linecap="round"
			/>
			<circle cx={tip.x} cy={tip.y} r="17" class="fill-gray-900" />
		{/if}
		<circle cx={CENTRE} cy={CENTRE} r="3.5" class="fill-gray-900" />

		{#if picking === 'hour'}
			{#each OUTER_HOURS as h (h)}
				{@const p = at(h, OUTER)}
				<text
					x={p.x}
					y={p.y}
					text-anchor="middle"
					dominant-baseline="central"
					class="text-[15px] {hour === h ? 'fill-white' : 'fill-gray-700'}"
				>
					{pad(h)}
				</text>
			{/each}
			{#each INNER_HOURS as h (h)}
				{@const p = at(h - 12, INNER)}
				<text
					x={p.x}
					y={p.y}
					text-anchor="middle"
					dominant-baseline="central"
					class="text-[13px] {hour === h ? 'fill-white' : 'fill-gray-500'}"
				>
					{h}
				</text>
			{/each}
		{:else}
			{#each MINUTE_MARKS as m (m)}
				{@const p = at(m / 5, OUTER)}
				<text
					x={p.x}
					y={p.y}
					text-anchor="middle"
					dominant-baseline="central"
					class="text-[15px] {minute === m ? 'fill-white' : 'fill-gray-700'}"
				>
					{pad(m)}
				</text>
			{/each}
		{/if}
	</svg>

	<!--
		The control, as far as the form, the keyboard and a screen reader are
		concerned. Visually hidden rather than `type="hidden"`, so it can still be
		focused and typed into by somebody who would rather — which is the whole
		reason the dial is allowed to be a drawing.
	-->
	<input {id} {name} {required} type="time" bind:value class="sr-only" />
</div>
