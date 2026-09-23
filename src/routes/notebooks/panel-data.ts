import { listActivities, listCategories } from '$lib/services/activities';
import { listCategories as listInventoryCategories } from '$lib/services/inventory';
import { listWorkoutCategories } from '$lib/services/workouts';
import { getCurrency } from '$lib/services/settings';
import { linkableSlots, listAreas } from '$lib/services/goals';
import { pickableNotebooks } from '$lib/services/notebooks';
import { mediaLimits } from '$lib/services/media';
import { listPeople } from '$lib/services/people';
import { listTodos } from '$lib/services/todos';
import { measuredActivities } from '$lib/services/workouts';
import type { Ctx } from '$lib/services/ctx';

/**
 * Everything the notebook panel needs besides the notebook itself.
 *
 * Two routes draw the same panel — the index, with the list beside it, and a
 * notebook on its own page — and they had drifted: the second loaded neither
 * the goal areas nor the workout measures, so the goal form there offered an
 * empty area picker. One function, so a tab gaining a field cannot work on one
 * route and quietly not on the other.
 */
export function notebookPanelData(ctx: Ctx) {
	return {
		// The Tasks tab is the to-do room looking at one subject, and its editor
		// offers the same two pickers.
		categories: listCategories(ctx),
		// What the other module tabs' editors offer, the same lists their own
		// rooms hand them — see each module's own card.
		inventoryCategories: listInventoryCategories(ctx),
		workoutCategories: listWorkoutCategories(ctx),
		// For the money a ledger holds and a bill expects.
		currency: getCurrency(ctx.userId),
		pickableNotebooks: pickableNotebooks(ctx),
		// The browser refuses an over-large picture before it is sent, because a
		// body over the adapter's limit is rejected with something no form can
		// read. Same number the server enforces, and here rather than on one
		// route because both of them draw the picture control now.
		pictureKilobytes: mediaLimits().maxKilobytes,
		// For the People field on a note, which completes rather than duplicates.
		allPeople: listPeople(ctx),
		// The Goals tab writes and edits a goal in place, with the same fields
		// and the same card the goals room uses.
		areas: listAreas(ctx),
		workoutMeasures: measuredActivities(ctx).map((m) => ({
			activity: m.activity,
			unit: m.unit
		})),
		// What a goal can be told to count — the card's own "what counts
		// towards this", which is part of a goal rather than part of that room.
		slots: linkableSlots(ctx),
		todos: listTodos(ctx).filter((one) => one.status !== 'done'),
		allTodos: listTodos(ctx).map((one) => ({
			id: one.id,
			title: one.title,
			status: one.status
		})),
		activities: listActivities(ctx, { activeOnly: true }).map((a) => ({
			id: a.id,
			name: a.name
		}))
	};
}
