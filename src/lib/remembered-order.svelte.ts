/**
 * The order a list is read in, kept in this browser.
 *
 * A sort is a way of looking at a list, not a fact about the account, so it
 * lives in `localStorage` under the room's name and comes back on the next
 * visit. Eight rooms each wrote this for themselves — the two state fields,
 * the effect that read storage, the function that wrote it, and the pair of
 * callbacks the sort control takes — and had drifted on one detail: whether
 * choosing a field also chooses the direction somebody means by it. That is
 * `natural` here: give it, and "edited" opens newest first; leave it, and the
 * arrow stays where it was.
 *
 * Storage can refuse — a private window, a full quota — and then the defaults
 * stand and a choice holds for the visit only.
 */
export type Direction = 'asc' | 'desc';

export class RememberedOrder<Order extends string> {
	order = $state() as Order;
	direction = $state() as Direction;

	private readonly orderKey: string;
	private readonly directionKey: string;

	constructor(
		/** The room, as the storage key reads it: `bills`, `notes`. */
		room: string,
		private readonly orders: readonly Order[],
		fallback: Order,
		/** The direction a field is read in when it is picked, if picking decides it. */
		private readonly natural?: (order: Order) => Direction,
		initialDirection: Direction = natural?.(fallback) ?? 'asc'
	) {
		this.orderKey = `ontoplano:${room}-order`;
		this.directionKey = `ontoplano:${room}-direction`;
		this.order = fallback;
		this.direction = initialDirection;
		this.restore();
	}

	private restore(): void {
		if (typeof localStorage === 'undefined') return;
		try {
			const kept = localStorage.getItem(this.orderKey);
			if (kept !== null && (this.orders as readonly string[]).includes(kept))
				this.order = kept as Order;
			const way = localStorage.getItem(this.directionKey);
			if (way === 'asc' || way === 'desc') this.direction = way;
		} catch {
			// A private window, or storage refused: the defaults stand.
		}
	}

	private remember(): void {
		try {
			localStorage.setItem(this.orderKey, this.order);
			localStorage.setItem(this.directionKey, this.direction);
		} catch {
			// It still holds for this visit.
		}
	}

	/** Read by this field — and, where the field decides it, that way round. */
	pick(next: Order): void {
		this.order = next;
		if (this.natural) this.direction = this.natural(next);
		this.remember();
	}

	/** The other way round. */
	flip(): void {
		this.direction = this.direction === 'asc' ? 'desc' : 'asc';
		this.remember();
	}
}
