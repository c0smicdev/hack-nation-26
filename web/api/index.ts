import { handle } from "../server/router.ts"

/**
 * Vercel function. vercel.json rewrites /api/<path> to /api?route=<path>, so
 * one function (and one in-memory store per warm instance) serves every route.
 */
export default { fetch: handle }
