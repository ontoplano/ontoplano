/**
 * The name an account goes by, as both the form and the service see it.
 *
 * Here rather than beside the service, which reaches the database and so
 * cannot be imported by a page: the field's `maxlength` and the service's
 * refusal are one number.
 */

/** The longest a display name may be: it sits in the header beside the menu. */
export const MAX_DISPLAY_NAME_LENGTH = 80;
