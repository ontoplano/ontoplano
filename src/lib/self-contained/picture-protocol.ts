/**
 * The two words the service worker and the page use to pass a picture.
 *
 * Its own module, with no imports at all, because both ends of this
 * conversation are separate bundles: the service worker is compiled on its
 * own, and anything it reaches — even for a constant — is pulled in with it.
 * Importing the page's side would drag the database worker into the service
 * worker's bundle, which is both absurd and, because that bundle has no code
 * splitting, fatal to the build.
 */

/** The message the service worker sends a page when an `<img>` wants bytes. */
export const PICTURE_REQUEST = 'ontoplano:picture';

export type PictureRequest = { kind: typeof PICTURE_REQUEST; id: number };

export type PictureReply =
	| { ok: true; mime: string; filename: string; bytes: ArrayBuffer }
	| { ok: false; message: string };
