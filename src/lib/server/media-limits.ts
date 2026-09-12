/**
 * A served instance's picture ceilings: what the operator asked for, met with
 * what the server can actually receive.
 *
 * Kept apart from the media service because it is the one part of that
 * service which is not portable — it reads `config.toml` and the Node
 * adapter's body limit, neither of which exists on a phone. The service asks
 * through `host.mediaLimits()`, and this is what the server binds there.
 */
import { loadConfig } from './config.js';
import { ENVELOPE, pictureCeiling } from './db/assert-body-limit.js';
import type { MediaLimits } from '$lib/services/media-limits.js';

/**
 * How much one folder-import request may carry where the operator has turned
 * the body limit off. Not unbounded: the bytes still become a `FormData` in
 * memory.
 */
const UNLIMITED_BATCH_BYTES = 32 * 1024 * 1024;

export function servedMediaLimits(): MediaLimits {
	const { media: limits } = loadConfig();
	const ceiling = pictureCeiling(limits.maxKilobytes);
	const maxKilobytes = ceiling.kilobytes;

	return {
		maxBytes: maxKilobytes * 1024,
		maxKilobytes,
		recipeImages: limits.recipeImages,
		entryImages: limits.entryImages,
		accountBytes: limits.accountMegabytes * 1024 * 1024,
		accountMegabytes: limits.accountMegabytes,
		galleryAlbums: limits.galleryAlbums,
		albumImages: limits.albumImages,
		importFiles: limits.importFiles,
		/*
		 * The most one folder-import request may carry.
		 *
		 * A folder is many pictures, and all of them in one POST is a body the
		 * Node adapter refuses before this app runs — a plain 413 with a body
		 * no page can read, which is the exact failure `pictureCeiling` exists
		 * to prevent for a single picture. So the browser sends the tree in
		 * batches that fit, and this is what fits: the server's own body limit
		 * less the multipart framing, never less than one picture.
		 */
		importBatchBytes:
			ceiling.limit === 0
				? UNLIMITED_BATCH_BYTES
				: Math.max(ceiling.limit - ENVELOPE, maxKilobytes * 1024)
	};
}
