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

/**
 * How hard a recording is squeezed, and therefore how long one can be.
 *
 * These two numbers only make sense next to each other. `MediaRecorder` left
 * to itself encodes at whatever the browser fancies — Chromium's default is
 * generous enough that 200KB is about a dozen seconds, which is not a voice
 * note, it is a cough.
 *
 * Opus at 16 kbps in one channel is a well-known point on that curve: plainly
 * intelligible speech, and nothing anybody would call hi-fi. It puts the
 * ceiling at around a hundred seconds, which is the number that matters —
 * `AUDIO_SECONDS` below is it, and the recorder counts down against it.
 *
 * Louder is not better here. A voice note is a sentence you did not want to
 * type; the format should be the cheapest one that carries a sentence.
 */
export const AUDIO_BITS_PER_SECOND = 16_000;

/**
 * How long a recording can run before it reaches the ceiling, in seconds.
 *
 * Derived rather than chosen, from the two numbers that decide it: an
 * instance that allows a bigger recording allows a longer one by the same
 * arithmetic, and nothing has to be kept in step by hand.
 */
export const audioSecondsFor = (kilobytes: number) =>
	Math.floor((kilobytes * 1024 * 8) / AUDIO_BITS_PER_SECOND);

export const AUDIO_SECONDS = audioSecondsFor(AUDIO_KILOBYTES);

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
