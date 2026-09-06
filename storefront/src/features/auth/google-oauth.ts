export type GoogleOAuthEnvironment = {
  embedded: boolean
  rootClassName: string
  userAgent: string
  maxTouchPoints: number
}

export type GoogleOAuthOptions = {
  redirectTo: string
  skipBrowserRedirect: boolean
  queryParams?: Record<string, string>
}

export function readGoogleOAuthEnvironment(): GoogleOAuthEnvironment {
  return {
    embedded: typeof window !== "undefined" && window.parent !== window,
    rootClassName: typeof document !== "undefined" ? document.documentElement.className : "",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    maxTouchPoints: typeof navigator !== "undefined" ? navigator.maxTouchPoints : 0,
  }
}

export function isNativeIOSGoogleOAuth(environment: GoogleOAuthEnvironment) {
  if (!environment.embedded) return false

  const platformClasses = environment.rootClassName.split(/\s+/)
  const hasNativeIOSMarker = platformClasses.includes("cozy-platform-ios")
  const hasIOSUserAgent = /iPhone|iPad|iPod/i.test(environment.userAgent)
  const isTouchIPad = /Macintosh/i.test(environment.userAgent) && environment.maxTouchPoints > 1

  return hasNativeIOSMarker || hasIOSUserAgent || isTouchIPad
}

/**
 * Keep Google signed in at the device/browser level, but require its account
 * chooser for every native iOS sign-in attempt. Android deliberately retains
 * its existing OAuth behavior.
 */
export function googleOAuthOptions(
  redirectTo: string,
  environment = readGoogleOAuthEnvironment(),
): GoogleOAuthOptions {
  const options: GoogleOAuthOptions = {
    redirectTo,
    skipBrowserRedirect: environment.embedded,
  }

  if (isNativeIOSGoogleOAuth(environment)) {
    options.queryParams = { prompt: "select_account" }
  }

  return options
}
