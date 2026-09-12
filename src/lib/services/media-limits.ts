/**
 * What an instance allows a picture to be.
 *
 * Its own module because two very different things answer the question. A
 * served instance reads `[media]` out of `config.toml` and reconciles it with
 * the body its server will actually accept; an instance running on a phone
 * has no config file and no body limit, and its numbers are the ones below.
 *
 * The type is shared so neither can quietly answer a different question, and
 * the services ask through `host.mediaLimits()` rather than either directly.
 */
export type MediaLimits = {
	/** The biggest single picture, in bytes and in the number people read. */
	maxBytes: number;
	maxKilobytes: number;
	/** How many pictures one recipe and one notebook entry may carry. */
	recipeImages: number;
	entryImages: number;
	/** Everything one account's pictures may add up to. */
	accountBytes: number;
	accountMegabytes: number;
	/** How many albums an account keeps, and how many pictures one holds. */
	galleryAlbums: number;
	albumImages: number;
	/** How many files one folder import carries, and how much one request does. */
	importFiles: number;
	importBatchBytes: number;
};

/**
 * The numbers on a device.
 *
 * Generous, because the storage is the phone's own and the person chose to
 * put it there — but not unbounded: the database is one OPFS file the browser
 * may evict, and a gallery that fills the disk is how that eviction happens.
 * Nothing travels over a network here, so the request-shaped limits are the
 * whole-import ones.
 */
export const DEVICE_MEDIA_LIMITS: MediaLimits = {
	maxBytes: 8 * 1024 * 1024,
	maxKilobytes: 8 * 1024,
	recipeImages: 12,
	entryImages: 40,
	accountBytes: 2 * 1024 * 1024 * 1024,
	accountMegabytes: 2048,
	galleryAlbums: 500,
	albumImages: 2000,
	importFiles: 2000,
	importBatchBytes: 64 * 1024 * 1024
};
