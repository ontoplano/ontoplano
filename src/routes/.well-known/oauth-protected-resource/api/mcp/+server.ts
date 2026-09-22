/**
 * The same document under the resource's own path.
 *
 * RFC 9728 has a client insert the resource's path into the well-known
 * address, so a server holding several protected things can answer for each.
 * This one holds exactly one — `/api/mcp` — and different clients ask at
 * different addresses, so both are answered rather than betting on which.
 */
export { GET, OPTIONS } from '../../+server';
