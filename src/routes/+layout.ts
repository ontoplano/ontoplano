/**
 * On a self-contained instance nothing renders on a server, because there is none:
 * every page is client-rendered over the device's own database. Everywhere
 * else this file changes nothing.
 */
import { env } from '$env/dynamic/public';

export const ssr = env.PUBLIC_ONTOPLANO_SELF_CONTAINED !== 'true';
