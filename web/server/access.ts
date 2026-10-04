import { AsyncLocalStorage } from "node:async_hooks"

import { HttpError, store } from "./store.js"

const caller = new AsyncLocalStorage<string | undefined>()
export const asUser = <T>(userId: string | undefined, run: () => T): T => caller.run(userId, run)
export const currentUserId = () => caller.getStore()

export interface ResourceAccess {
  ownerId: string
  readerIds: string[]
}

export function claimResource(id: string) {
  if (!store.access.has(id))
    store.access.set(id, { ownerId: currentUserId() ?? "local-development", readerIds: [] })
}

export function canRead(id: string) {
  const user = currentUserId()
  if (!user) return process.env.NODE_ENV !== "production"
  const access = store.access.get(id)
  return !!access && (access.ownerId === user || access.readerIds.includes(user))
}

export function requireAccess(id: string, write = false) {
  const user = currentUserId()
  if (!canRead(id) || (write && user && store.access.get(id)?.ownerId !== user))
    throw new HttpError(404, "Resource not found")
}

export const readableWorkMaps = () => store.workMaps.filter((map) => canRead(map.id))
