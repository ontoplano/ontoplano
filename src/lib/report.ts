/**
 * How long a report or a suggestion may be.
 *
 * Named here because both ends need it: the field stops at this many
 * characters so nobody writes past what will be kept, and the service
 * enforces the same number because a limit that lives only in a form is not a
 * limit. Long enough for what happened and what was expected; short enough
 * that the operator reads it.
 */
export const MAX_REPORT_LENGTH = 500;
