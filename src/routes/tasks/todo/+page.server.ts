/**
 * The server's face of this route.
 *
 * The bodies live in `page.local.ts`, written against the slice of the
 * request that also exists on a local instance — which is what lets the same
 * load and the same actions run inside the device's worker, dispatched by
 * $lib/local. A route with logic only a server can run keeps that logic
 * here instead.
 */
export { load, actions } from './page.local';
