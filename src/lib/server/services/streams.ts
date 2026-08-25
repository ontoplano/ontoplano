import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm';

import { db } from '../db/index.js';
import { dataPoints, dataStreams } from '../db/schema.js';
import { localDateOf, type Ctx } from './ctx.js';
import { stamps } from './time.js';
import { NotFoundError, ValidationError } from './errors.js';
import { isoInstant, jsonObject, num, oneOf, optionalStr, slug, str } from './validate.js';

export const STREAM_KINDS = ['measurement', 'event', 'counter', 'state'] as const;
export const STREAM_DISPLAYS = [
	'line_chart',
	'calendar_heatmap',
	'latest_value',
	'bar_chart',
	'list'
] as const;

export type StreamKind = (typeof STREAM_KINDS)[number];
export type StreamDisplay = (typeof STREAM_DISPLAYS)[number];

const MAX_POINTS_PER_BATCH = 500;
const MAX_META_BYTES = 2000;
const MAX_CONFIG_BYTES = 2000;

export type Stream = typeof dataStreams.$inferSelect;

// --- Streams ---

/** Declare a stream. Idempotent per (user, slug) so producers can call it at every startup. */
export function upsertStream(
	ctx: Ctx,
	input: Record<string, unknown>
): { stream: Stream; created: boolean } {
	const values = {
		slug: slug(input.slug, 'slug'),
		name: str(input.name, 'name', { max: 80 }),
		source: str(input.source, 'source', { max: 60 }),
		kind: oneOf(input.kind, 'kind', STREAM_KINDS),
		unit: optionalStr(input.unit, 'unit', { max: 20 }),
		display:
			input.display === undefined ? 'list' : oneOf(input.display, 'display', STREAM_DISPLAYS),
		config: jsonObject(input.config, 'config', MAX_CONFIG_BYTES)
	};

	const nowIso = ctx.now.toISOString();
	const existing = getStreamBySlug(ctx, values.slug, { throwIfMissing: false });

	if (existing) {
		const updated = db
			.update(dataStreams)
			.set({
				name: values.name,
				source: values.source,
				kind: values.kind,
				unit: values.unit,
				display: values.display,
				config: values.config,
				archivedAt: null,
				updatedAt: nowIso
			})
			.where(and(eq(dataStreams.id, existing.id), eq(dataStreams.userId, ctx.userId)))
			.returning()
			.get();
		return { stream: updated, created: false };
	}

	const created = db
		.insert(dataStreams)
		.values({
			...stamps(ctx),
			...stamps(ctx),
			...values,
			userId: ctx.userId,
			createdAt: nowIso,
			updatedAt: nowIso
		})
		.returning()
		.get();

	return { stream: created, created: true };
}

export function listStreams(ctx: Ctx, opts: { includeArchived?: boolean } = {}): Stream[] {
	const rows = db
		.select()
		.from(dataStreams)
		.where(eq(dataStreams.userId, ctx.userId))
		.orderBy(asc(dataStreams.name))
		.all();
	return opts.includeArchived ? rows : rows.filter((s) => !s.archivedAt);
}

export function getStreamBySlug(
	ctx: Ctx,
	streamSlug: string,
	opts: { throwIfMissing?: boolean } = {}
): Stream | null {
	const row = db
		.select()
		.from(dataStreams)
		.where(and(eq(dataStreams.slug, streamSlug), eq(dataStreams.userId, ctx.userId)))
		.get();
	if (!row && opts.throwIfMissing !== false) throw new NotFoundError('Stream');
	return row ?? null;
}

export function updateStreamDisplay(
	ctx: Ctx,
	id: number,
	input: { display?: unknown; name?: unknown; showOnDashboard?: unknown }
): void {
	const patch: Record<string, unknown> = { updatedAt: ctx.now.toISOString() };
	if (input.display !== undefined) patch.display = oneOf(input.display, 'display', STREAM_DISPLAYS);
	if (input.name !== undefined) patch.name = str(input.name, 'name', { max: 80 });
	if (input.showOnDashboard !== undefined) patch.showOnDashboard = Boolean(input.showOnDashboard);

	const res = db
		.update(dataStreams)
		.set(patch)
		.where(and(eq(dataStreams.id, id), eq(dataStreams.userId, ctx.userId)))
		.run();
	if (res.changes === 0) throw new NotFoundError('Stream');
}

/** Delete a stream and all its points (points cascade). */
export function deleteStream(ctx: Ctx, id: number): void {
	const res = db
		.delete(dataStreams)
		.where(and(eq(dataStreams.id, id), eq(dataStreams.userId, ctx.userId)))
		.run();
	if (res.changes === 0) throw new NotFoundError('Stream');
}

// --- Points ---

export interface PushResult {
	accepted: number;
	duplicates: number;
	rejected: { external_id: string | null; reason: string }[];
}

interface NormalisedPoint {
	externalId: string;
	at: string;
	localDate: string;
	valueNum: number | null;
	valueText: string | null;
	meta: string;
}

function normalisePoint(ctx: Ctx, raw: unknown, kind: StreamKind): NormalisedPoint {
	if (typeof raw !== 'object' || raw === null) throw new ValidationError('point must be an object');
	const p = raw as Record<string, unknown>;

	const at = isoInstant(p.at, 'at');
	// A producer that omits external_id gets the instant as its id. That keeps
	// the idempotency guarantee meaningful for simple producers rather than
	// silently degrading to "every retry duplicates".
	const externalId = str(p.external_id ?? at, 'external_id', { max: 128 });

	let valueNum: number | null = null;
	let valueText: string | null = null;

	const hasValue = p.value !== undefined && p.value !== null;
	if (kind === 'measurement' || kind === 'counter') {
		if (!hasValue) throw new ValidationError(`value is required for '${kind}' streams`);
		valueNum = num(p.value, 'value');
	} else if (hasValue) {
		if (typeof p.value === 'number') valueNum = num(p.value, 'value');
		else valueText = str(p.value, 'value', { max: 500 });
	}

	if (p.text !== undefined && p.text !== null) valueText = str(p.text, 'text', { max: 500 });

	return {
		externalId,
		at,
		localDate: localDateOf(new Date(at), ctx.tz),
		valueNum,
		valueText,
		meta: jsonObject(p.meta, 'meta', MAX_META_BYTES)
	};
}

/**
 * Push a batch of points.
 *
 * Partial success is deliberate: an offline phone draining a week of readings
 * must not have the whole batch rejected because one point is malformed, or it
 * will retry the good ones forever. Re-sending an already-stored point is
 * reported as a duplicate, not an error — that is the designed behaviour and
 * producers should treat it as success.
 */
export function pushPoints(ctx: Ctx, streamSlug: string, rawPoints: unknown): PushResult {
	const stream = getStreamBySlug(ctx, streamSlug)!;

	if (!Array.isArray(rawPoints)) throw new ValidationError('points must be an array');
	if (rawPoints.length === 0) return { accepted: 0, duplicates: 0, rejected: [] };
	if (rawPoints.length > MAX_POINTS_PER_BATCH)
		throw new ValidationError(`at most ${MAX_POINTS_PER_BATCH} points per request`);

	const rejected: PushResult['rejected'] = [];
	const valid: NormalisedPoint[] = [];

	for (const raw of rawPoints) {
		try {
			valid.push(normalisePoint(ctx, raw, stream.kind));
		} catch (e) {
			const externalId =
				typeof raw === 'object' && raw !== null && 'external_id' in raw
					? String((raw as Record<string, unknown>).external_id)
					: null;
			rejected.push({
				external_id: externalId,
				reason: e instanceof Error ? e.message : 'invalid point'
			});
		}
	}

	if (valid.length === 0) return { accepted: 0, duplicates: 0, rejected };

	// Collapse duplicates within the batch itself — last one wins — so the
	// insert below can't trip the unique index against its own payload.
	const byExternalId = new Map<string, NormalisedPoint>();
	for (const p of valid) byExternalId.set(p.externalId, p);
	const deduped = [...byExternalId.values()];

	const existing = new Set(
		db
			.select({ externalId: dataPoints.externalId })
			.from(dataPoints)
			.where(
				and(
					eq(dataPoints.streamId, stream.id),
					inArray(
						dataPoints.externalId,
						deduped.map((p) => p.externalId)
					)
				)
			)
			.all()
			.map((r) => r.externalId)
	);

	const fresh = deduped.filter((p) => !existing.has(p.externalId));
	const nowIso = ctx.now.toISOString();

	if (fresh.length > 0) {
		db.insert(dataPoints)
			.values(
				fresh.map((p) => ({
					userId: ctx.userId,
					streamId: stream.id,
					externalId: p.externalId,
					at: p.at,
					localDate: p.localDate,
					valueNum: p.valueNum,
					valueText: p.valueText,
					meta: p.meta,
					createdAt: nowIso
				}))
			)
			// Belt and braces against a concurrent push racing the SELECT above.
			.onConflictDoNothing()
			.run();

		db.update(dataStreams)
			.set({ updatedAt: nowIso })
			.where(and(eq(dataStreams.id, stream.id), eq(dataStreams.userId, ctx.userId)))
			.run();
	}

	return {
		accepted: fresh.length,
		duplicates: deduped.length - fresh.length + (valid.length - deduped.length),
		rejected
	};
}

export type DataPoint = typeof dataPoints.$inferSelect;

export function listPoints(
	ctx: Ctx,
	streamSlug: string,
	opts: { since?: string; until?: string; limit?: number; order?: 'asc' | 'desc' } = {}
): DataPoint[] {
	const stream = getStreamBySlug(ctx, streamSlug)!;
	const limit = opts.limit ? num(opts.limit, 'limit', { min: 1, max: 5000, int: true }) : 1000;

	const filters = [eq(dataPoints.streamId, stream.id), eq(dataPoints.userId, ctx.userId)];
	if (opts.since) filters.push(gte(dataPoints.at, isoInstant(opts.since, 'since')));
	if (opts.until) filters.push(lte(dataPoints.at, isoInstant(opts.until, 'until')));

	return db
		.select()
		.from(dataPoints)
		.where(and(...filters))
		.orderBy(opts.order === 'desc' ? desc(dataPoints.at) : asc(dataPoints.at))
		.limit(limit)
		.all();
}

export function deletePoint(ctx: Ctx, streamSlug: string, externalId: string): void {
	const stream = getStreamBySlug(ctx, streamSlug)!;
	const res = db
		.delete(dataPoints)
		.where(
			and(
				eq(dataPoints.streamId, stream.id),
				eq(dataPoints.userId, ctx.userId),
				eq(dataPoints.externalId, externalId)
			)
		)
		.run();
	if (res.changes === 0) throw new NotFoundError('Point');
}

export interface StreamStats {
	count: number;
	latest: DataPoint | null;
	firstAt: string | null;
}

export function streamStats(ctx: Ctx, streamId: number): StreamStats {
	const rows = db
		.select()
		.from(dataPoints)
		.where(and(eq(dataPoints.streamId, streamId), eq(dataPoints.userId, ctx.userId)))
		.orderBy(desc(dataPoints.at))
		.all();

	return {
		count: rows.length,
		latest: rows[0] ?? null,
		firstAt: rows.length > 0 ? rows[rows.length - 1].at : null
	};
}

/** Serialise a point for the API — snake_case, matching the documented contract. */
export function serialisePoint(p: DataPoint) {
	return {
		external_id: p.externalId,
		at: p.at,
		local_date: p.localDate,
		value: p.valueNum ?? p.valueText,
		meta: JSON.parse(p.meta || '{}')
	};
}

export function serialiseStream(s: Stream) {
	return {
		slug: s.slug,
		name: s.name,
		source: s.source,
		kind: s.kind,
		unit: s.unit,
		display: s.display,
		archived: Boolean(s.archivedAt),
		created_at: s.createdAt,
		updated_at: s.updatedAt
	};
}
