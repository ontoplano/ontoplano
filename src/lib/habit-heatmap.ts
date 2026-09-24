/**
 * The arithmetic behind a habit's year at a glance.
 *
 * Written inside the Health room, which is why a habit shown anywhere else —
 * a notebook's Habits tab — had no heatmap at all: the squares were a page's
 * markup rather than something a habit comes with. `HabitCard` draws them now,
 * and this is what it counts with. Moved as it stood, not rewritten: the grid
 * lines up with the account's own first day of the week, and that is fiddly
 * enough to be worth keeping exactly.
 */

/** Monday first, which is how `scheduledDays` is numbered. */
export const FULL_DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** The weekday labels, starting on the day this account's week starts on. */
export function dayLabelsFrom(firstDay: number): string[] {
	return [...FULL_DAY_LABELS.slice(firstDay), ...FULL_DAY_LABELS.slice(0, firstDay)];
}

/*
 * A year of days, laid out in weeks.
 *
 * Every Date below is a cursor walked once through the year and then thrown
 * away — nothing reads them reactively. The rule that would object to them
 * only applies inside a component, which is why the disable that rode along
 * with this code is not here.
 */
export function buildHeatmapWeeks(days: number, firstDay: number): string[][] {
	const weeks: string[][] = [];
	const today = new Date();
	const fd = firstDay;

	const endDay = new Date(today);
	const startDay = new Date(today);
	startDay.setDate(startDay.getDate() - (days - 1));

	const startDow = startDay.getDay();
	const adjustedStart = new Date(startDay);
	const jsDayOfFirstDay = fd === 6 ? 0 : fd + 1;
	const diff = (startDow - jsDayOfFirstDay + 7) % 7;
	if (diff !== 0) {
		adjustedStart.setDate(adjustedStart.getDate() - diff);
	}

	const current = new Date(adjustedStart);
	let week: string[] = [];

	while (current <= endDay || week.length > 0) {
		const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
		week.push(dateStr);

		if (week.length === 7) {
			weeks.push(week);
			week = [];
		}

		current.setDate(current.getDate() + 1);
		if (current > endDay && week.length === 0) break;
	}

	if (week.length > 0) {
		while (week.length < 7) week.push('');
		weeks.push(week);
	}

	return weeks;
}

/** Which days it is due, in words. Empty means every day. */
export function formatScheduledDays(raw: string | null): string {
	if (!raw || raw.trim() === '') return 'Every day';
	const days = raw
		.split(',')
		.map((one) => parseInt(one.trim(), 10))
		.filter((n) => !isNaN(n) && n >= 0 && n <= 6);
	if (days.length === 0) return 'Every day';
	if (days.length === 7) return 'Every day';
	return days.map((d) => FULL_DAY_LABELS[d]).join(', ');
}

/**
 * What the log button does, for the tooltip and the screen reader.
 *
 * The button itself is the target glyph alone, like every other row action on
 * the card — the word only ever said what the colour and the icon already say.
 */
export function logLabel(habit: { type: string }): string {
	return habit.type === 'bad' ? 'I slipped' : habit.type === 'neutral' ? 'Log' : 'Done';
}
