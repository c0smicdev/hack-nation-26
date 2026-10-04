import { ImageOff } from "lucide-react"
import { useEffect, useState, type ImgHTMLAttributes } from "react"

import { api } from "@/lib/api"
import { supabase } from "@/lib/auth/supabase"

/** Fetch screenshots with authorization; no access tokens in URLs or persisted image cache. */
export function ProtectedImage({
  src,
  alt,
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & { src: string }) {
  const [image, setImage] = useState<{
    source: string
    version: number
    url?: string
    failed?: boolean
  }>()
  const [authVersion, setAuthVersion] = useState(0)
  useEffect(() => {
    const listener = supabase?.auth.onAuthStateChange(() =>
      setAuthVersion((version) => version + 1),
    )
    return () => listener?.data.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    let objectUrl: string | undefined
    void api
      .getFrame(src, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return
        objectUrl = URL.createObjectURL(blob)
        setImage({ source: src, version: authVersion, url: objectUrl })
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setImage({ source: src, version: authVersion, failed: true })
      })
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [src, authVersion])
  if (image?.source === src && image.version === authVersion && image.failed)
    return (
      <div className={props.className} role="img" aria-label={alt ?? "Screenshot unavailable"}>
        <ImageOff className="m-auto size-6 text-muted-foreground" />
      </div>
    )
  return (
    <img
      {...props}
      src={image?.source === src && image.version === authVersion ? image.url : undefined}
      alt={alt}
    />
  )
}
