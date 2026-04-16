import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { shoppingItems } from '$lib/server/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { toLocalISOString } from '$lib/server/week-generator';

export const load: PageServerLoad = async (event) => {
	const userId = event.locals.user!.id;

	const items = db
		.select({
			id: shoppingItems.id,
			name: shoppingItems.name,
			type: shoppingItems.type,
			notes: shoppingItems.notes,
			bought: shoppingItems.bought,
			boughtAt: shoppingItems.boughtAt,
			createdAt: shoppingItems.createdAt
		})
		.from(shoppingItems)
		.where(eq(shoppingItems.userId, userId))
		.orderBy(shoppingItems.bought, desc(shoppingItems.createdAt))
		.all();

	return { items };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const name = formData.get('name')?.toString()?.trim();
		const type = formData.get('type')?.toString()?.trim();
		const notes = formData.get('notes')?.toString()?.trim() ?? '';

		if (!name) return fail(400, { message: 'Name is required' });
		if (type !== 'someday' && type !== 'replenish') return fail(400, { message: 'Invalid type' });

		db.insert(shoppingItems).values({ userId, name, type, notes }).run();
		return { success: true };
	},

	update: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		const name = formData.get('name')?.toString()?.trim();
		const type = formData.get('type')?.toString()?.trim();
		const notes = formData.get('notes')?.toString()?.trim() ?? '';

		if (!id) return fail(400, { message: 'Missing id' });
		if (!name) return fail(400, { message: 'Name is required' });
		if (type !== 'someday' && type !== 'replenish') return fail(400, { message: 'Invalid type' });

		const existing = db
			.select({ id: shoppingItems.id })
			.from(shoppingItems)
			.where(and(eq(shoppingItems.id, id), eq(shoppingItems.userId, userId)))
			.get();
		if (!existing) return fail(404, { message: 'Item not found' });

		db.update(shoppingItems)
			.set({ name, type, notes, updatedAt: toLocalISOString(new Date()) })
			.where(eq(shoppingItems.id, id))
			.run();
		return { success: true };
	},

	toggleBought: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));

		if (!id) return fail(400, { message: 'Missing id' });

		const item = db
			.select({ id: shoppingItems.id, bought: shoppingItems.bought })
			.from(shoppingItems)
			.where(and(eq(shoppingItems.id, id), eq(shoppingItems.userId, userId)))
			.get();
		if (!item) return fail(404, { message: 'Item not found' });

		const now = toLocalISOString(new Date());
		db.update(shoppingItems)
			.set({
				bought: !item.bought,
				boughtAt: item.bought ? null : now,
				updatedAt: now
			})
			.where(eq(shoppingItems.id, id))
			.run();
		return { success: true };
	},

	delete: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));

		if (!id) return fail(400, { message: 'Missing id' });

		const existing = db
			.select({ id: shoppingItems.id })
			.from(shoppingItems)
			.where(and(eq(shoppingItems.id, id), eq(shoppingItems.userId, userId)))
			.get();
		if (!existing) return fail(404, { message: 'Item not found' });

		db.delete(shoppingItems)
			.where(and(eq(shoppingItems.id, id), eq(shoppingItems.userId, userId)))
			.run();
		return { success: true };
	},

	restock: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));

		if (!id) return fail(400, { message: 'Missing id' });

		const item = db
			.select({ id: shoppingItems.id, type: shoppingItems.type })
			.from(shoppingItems)
			.where(and(eq(shoppingItems.id, id), eq(shoppingItems.userId, userId)))
			.get();
		if (!item) return fail(404, { message: 'Item not found' });
		if (item.type !== 'replenish')
			return fail(400, { message: 'Only replenish items can be restocked' });

		db.update(shoppingItems)
			.set({ bought: false, boughtAt: null, updatedAt: toLocalISOString(new Date()) })
			.where(eq(shoppingItems.id, id))
			.run();
		return { success: true };
	}
};
