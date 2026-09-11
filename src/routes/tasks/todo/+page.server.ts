/**
 * The server's face of this route.
 *
 * The bodies live in `page.self-contained.ts`, written against the slice of the
 * request that also exists on a self-contained instance — which is what lets the same
 * load and the same actions run inside the device's worker, dispatched by
 * $lib/local. A route with logic only a server can run keeps that logic
 * here instead.
 */
export { load, actions } from './page.self-contained';
