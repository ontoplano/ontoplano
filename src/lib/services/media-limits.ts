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
/**
 * A recording's ceiling, and how many of them an account keeps.
 *
 * The same on a phone as on a server, unlike every other number here: the
 * others scale with the disk somebody chose, and these are about what a voice
 * note *is*. Named here so both halves read one answer.
 */
export const AUDIO_KILOBYTES = 200;
export const ACCOUNT_AUDIOS = 100;

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
	/**
	 * What a recording may be, and how many an account keeps.
	 *
	 * Separate numbers from a picture's, and much smaller ones: a recording is
	 * made in the app rather than chosen from a disk, it is a voice note
	 * rather than a document, and Opus at a speech bitrate fits a couple of
	 * minutes into this. A ceiling somebody meets is a ceiling that tells them
	 * to record a second one, which is the right shape for a note.
	 */
	audioBytes: number;
	audioKilobytes: number;
	accountAudios: number;
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
	importBatchBytes: 64 * 1024 * 1024,
	audioBytes: AUDIO_KILOBYTES * 1024,
	audioKilobytes: AUDIO_KILOBYTES,
	accountAudios: ACCOUNT_AUDIOS
};
