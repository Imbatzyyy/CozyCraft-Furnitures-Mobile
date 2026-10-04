import { useState, type ImgHTMLAttributes } from "react"
import { productImageSources } from "../lib/responsive-image"

/**
 * A photo that fades in once it has loaded instead of painting in pieces.
 * Until then (or if it fails) the frame's own placeholder tone shows, never a
 * half-drawn or broken image. Already-cached photos appear immediately.
 */
export default function CozyImage({ className, onLoad, onError, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const [loadedSrc, setLoadedSrc] = useState<string | undefined>()
  const [failedSource, setFailedSource] = useState<string>()
  const responsive = failedSource === props.src || props.srcSet ? null : productImageSources(props.src)
  const ready = loadedSrc !== undefined && loadedSrc === props.src
  return <img
    {...props}
    // Netlify remote-image transformations don't forward custom CORS headers.
    // Display them as ordinary images; retain CORS for an original fallback.
    crossOrigin={responsive ? undefined : props.crossOrigin}
    src={responsive?.src || props.src}
    srcSet={responsive?.srcSet || props.srcSet}
    sizes={props.sizes || "(max-width: 600px) 50vw, 320px"}
    decoding={props.decoding || "async"}
    className={[className, "cozy-image", ready ? "is-loaded" : ""].filter(Boolean).join(" ")}
    ref={(image) => {
      if (image?.complete && image.naturalWidth > 0 && loadedSrc !== props.src) setLoadedSrc(props.src)
    }}
    onLoad={(event) => {
      setLoadedSrc(props.src)
      onLoad?.(event)
    }}
    onError={(event) => {
      if (responsive) { setFailedSource(props.src); return }
      onError?.(event)
    }}
  />
}
