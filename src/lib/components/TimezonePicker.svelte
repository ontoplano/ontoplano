<script lang="ts">
	import { zoneLabel, type Zone } from '$lib/timezones';

	/**
	 * Where you are, chosen rather than typed.
	 *
	 * It was an `<input>` in both places that ask — first run, and preferences —
	 * and what it wanted was `America/Sao_Paulo`. One letter wrong and every date
	 * in the app is a day out with nothing on screen to say why, and nobody
	 * knows off the top of their head whether it is `Sao_Paulo` or `São Paulo`
	 * or `Brazil/East`.
	 *
	 * A native `<select>`, deliberately, and not a search box with a dropdown:
	 * four hundred options in a `<select>` is a control every browser already
	 * knows how to make usable — type-to-jump, a full-height list on a laptop, a
	 * proper wheel on a phone — and none of that is worth rebuilding badly.
	 *
	 * Ordered by offset, west to east, with the offset as the heading — see
	 * `$lib/timezones.ts`. It is today's offset, because that is the number
	 * somebody is checking against the clock in front of them.
	 */
	let {
		groups,
		value = $bindable(),
		name = 'timezone',
		id,
		required = false,
		label = 'Timezone'
	}: {
		groups: { label: string; zones: Zone[] }[];
		value: string;
		name?: string;
		id?: string;
		required?: boolean;
		label?: string;
	} = $props();

	/**
	 * A stored zone the list does not have.
	 *
	 * An account set up years ago may hold a name this platform has since
	 * retired, and a picker that silently selects the first option would move
	 * somebody's whole calendar without telling them. It is offered as itself,
	 * at the top, and stays chosen until they change it.
	 */
	const known = $derived(groups.some((g) => g.zones.some((z) => z.id === value)));
</script>

<select {name} {id} {required} bind:value aria-label={label} class="select mt-1">
	{#if value && !known}
		<option {value}>{value} (kept as it is)</option>
	{/if}
	{#each groups as group (group.label)}
		<optgroup label={group.label}>
			{#each group.zones as zone (zone.id)}
				<option value={zone.id}>{zoneLabel(zone)}</option>
			{/each}
		</optgroup>
	{/each}
</select>
