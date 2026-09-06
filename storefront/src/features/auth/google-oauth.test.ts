import { describe, expect, it } from "vitest"
import { googleOAuthOptions, isNativeIOSGoogleOAuth, type GoogleOAuthEnvironment } from "./google-oauth"

const environment = (overrides: Partial<GoogleOAuthEnvironment> = {}): GoogleOAuthEnvironment => ({
  embedded: true,
  rootClassName: "",
  userAgent: "Mozilla/5.0 (Linux; Android 16)",
  maxTouchPoints: 5,
  ...overrides,
})

describe("native Google OAuth account selection", () => {
  it("forces the Google account chooser for iPhone sign-in and registration", () => {
    const options = googleOAuthOptions(
      "com.cozycraft.furniture://auth/callback",
      environment({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X)" }),
    )

    expect(options).toEqual({
      redirectTo: "com.cozycraft.furniture://auth/callback",
      skipBrowserRedirect: true,
      queryParams: { prompt: "select_account" },
    })
  })

  it("uses the native platform marker when an embedded WKWebView omits iPhone from its user agent", () => {
    expect(isNativeIOSGoogleOAuth(environment({
      rootClassName: "cozy-platform-ios cozy-platform-ios26",
      userAgent: "Mozilla/5.0 AppleWebKit/605.1.15 Mobile",
    }))).toBe(true)
  })

  it("recognizes the desktop-style user agent used by touch-capable iPads", () => {
    expect(isNativeIOSGoogleOAuth(environment({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15",
      maxTouchPoints: 5,
    }))).toBe(true)
  })

  it("preserves the working Android native OAuth flow", () => {
    expect(googleOAuthOptions(
      "com.cozycraft.furniture://auth/callback",
      environment({ rootClassName: "cozy-platform-android" }),
    )).toEqual({
      redirectTo: "com.cozycraft.furniture://auth/callback",
      skipBrowserRedirect: true,
    })
  })

  it("does not change ordinary top-level browser OAuth", () => {
    expect(googleOAuthOptions(
      "https://www.cozycraftfurnitures.com/app#/shop",
      environment({
        embedded: false,
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X)",
      }),
    )).toEqual({
      redirectTo: "https://www.cozycraftfurnitures.com/app#/shop",
      skipBrowserRedirect: false,
    })
  })
})
