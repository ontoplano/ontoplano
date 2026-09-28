/**
 * How the things inside one inventory card are sorted, and which way round.
 *
 * The cards themselves keep their places — where a thing lives, then the
 * category's own order — so this only decides the rows within a card. The
 * default is the order things were written down, newest first, which is what
 * the list did before it could be asked.
 */
import type { PlainKey } from '$lib/i18n/keys';

export const ITEM_ORDERS = ['added', 'name', 'count', 'price'] as const;
export type ItemOrder = (typeof ITEM_ORDERS)[number];
export type ItemDirection = 'asc' | 'desc';

export const DEFAULT_ITEM_ORDER: ItemOrder = 'added';

/** Where the choice is kept: a way of looking at a list, not a fact about the account. */
export const ITEM_ORDER_KEY = 'ontoplano:inventory-order';
export const ITEM_DIRECTION_KEY = 'ontoplano:inventory-direction';

export const ITEM_ORDER_LABELS: Record<ItemOrder, PlainKey> = {
	added: 'inventory.orderAdded',
	name: 'inventory.orderName',
	count: 'inventory.orderCount',
	price: 'inventory.orderPrice'
};

/** A name reads A to Z; everything else opens with the most of it first. */
export function itemDirectionFor(order: ItemOrder): ItemDirection {
	return order === 'name' ? 'asc' : 'desc';
}

export function isItemOrder(value: unknown): value is ItemOrder {
	return typeof value === 'string' && (ITEM_ORDERS as readonly string[]).includes(value);
}

type Sortable = {
	id: number;
	name: string;
	qty: number;
	priceCents: number | null;
	createdAt: string | null;
};

/**
 * The comparison for one order. A thing with no price sorts after every priced
 * one whichever way round, and ties fall back to the name so the order is
 * stable between visits.
 */
export function compareItems(
	a: Sortable,
	b: Sortable,
	order: ItemOrder,
	direction: ItemDirection
): number {
	const way = direction === 'asc' ? 1 : -1;
	const byName = a.name.localeCompare(b.name);
	switch (order) {
		case 'name':
			return byName * way || a.id - b.id;
		case 'count':
			return (a.qty - b.qty) * way || byName;
		case 'price': {
			if (a.priceCents === null || b.priceCents === null) {
				if (a.priceCents === b.priceCents) return byName;
				return a.priceCents === null ? 1 : -1;
			}
			return (a.priceCents - b.priceCents) * way || byName;
		}
		case 'added':
			return ((a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id - b.id) * way;
	}
}
