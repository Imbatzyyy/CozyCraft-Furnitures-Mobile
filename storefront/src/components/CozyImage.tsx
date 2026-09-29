import { useState, type ImgHTMLAttributes } from "react"

/**
 * A photo that fades in once it has loaded instead of painting in pieces.
 * Until then (or if it fails) the frame's own placeholder tone shows, never a
 * half-drawn or broken image. Already-cached photos appear immediately.
 */
export default function CozyImage({ className, onLoad, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const [loadedSrc, setLoadedSrc] = useState<string | undefined>()
  const ready = loadedSrc !== undefined && loadedSrc === props.src
  return <img
    {...props}
    className={[className, "cozy-image", ready ? "is-loaded" : ""].filter(Boolean).join(" ")}
    ref={(image) => {
      if (image?.complete && image.naturalWidth > 0 && loadedSrc !== props.src) setLoadedSrc(props.src)
    }}
    onLoad={(event) => {
      setLoadedSrc(props.src)
      onLoad?.(event)
    }}
  />
}
