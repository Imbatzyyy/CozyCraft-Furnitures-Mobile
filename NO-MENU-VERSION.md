# CozyCraft — separate no-side-menu version

Based on mobile release 1.0.85 (d32862c). This is an isolated variant project;
the standard mobile checkout, published APK, website, and shared backend have
not been edited or redeployed for this variant. Publish this variant only on
the codex/no-side-menu branch and its separate v1.0.85-no-menu prerelease,
never over main or the standard latest release.

## Variant changes

- Remove the hamburger and side drawer from the storefront and all in-app
  information headers. Keep the bottom tabs, search, notifications, profile,
  Account tools, and existing information pages.
- Keep Account information buttons in two columns. Privacy occupies a centered
  final row, the same width as Company History and Terms above it.
- Replace Sammuel Guill Concepcion only here with **Jacob Christopher Cañete**,
  using his website photo and **Platform Development** role. The new description
  is role-based copy: “Focuses on the app’s technical foundation, bringing
  features together to support a connected and dependable furniture-shopping
  experience.” His supplied email is **qjcanete02@tip.edu.ph**, available as a
  tappable email link. The other four members and contacts are unchanged.
- Give local Care navigation answers for the no-menu Account paths and the
  variant developer roster. The shared assistant service is not changed.
- Preserve Account when native Back closes an information page.

## Installation and identity

Android version name: **1.0.85-no-menu**, version code **86**.
iOS version: **1.0.85**, build **73**.
Home-screen display name: **CozyCraft No Menu**.

The package/bundle ID remains **com.cozycraft.furniture**. This deliberately
retains the established authentication, payment-return, signing, and notification
configuration. Installing this build replaces the standard CozyCraft app on
that device; it is not a side-by-side installation. The original project and
published 1.0.85 APK remain available to restore the standard UI. The variant
uses the same live backend, not a separate test database.

## Xcode 27

Open **Open No-Menu Version in Xcode.command** in this folder, or open
**ios/App/App.xcodeproj** directly. Select the **App** scheme, choose your phone
or an iOS simulator, and press Run. The existing automatic-signing team is
preserved; physical-device installation and any signing prompts are yours to
complete. The project's build phase rebuilds this variant's own web assets.

Do not open the project in the standard COZYCRAFT MOBILE folder when testing
this variant. Both folders contain an App.xcodeproj.

## Rebuild

Use Node 24, Java 21, the installed Android SDK, and Xcode 27.

```sh
npm ci
npm --prefix storefront ci
npm run native:prepare
npx cap sync
npm run ios:build:check
cd android
./gradlew assembleDebug
```

The Android debug APK is at android/app/build/outputs/apk/debug/app-debug.apk.
It is for direct testing, not a Play Store upload. This variant is published
separately on GitHub; no store submission, backend migration, or physical-phone
installation is included.

## Verification — October 16, 2026

- 486 storefront tests, 25 native-shell tests, and 11 Xcode toolchain tests passed.
- TypeScript and lint passed; shared-backend ownership checks passed.
- 20 Chromium/WebKit navigation layouts passed, including narrow screens,
  landscape, larger text, keyboard focus, native Back, policy cache, Jacob's
  photo, and centered Privacy. Two additional built-production checks passed.
- 112 chat interactions across eight layouts passed. Onboarding/voucher,
  bounded-read/recovery, and 18 reliability browser checks also passed.
- Android debug, Xcode 27 simulator, and unsigned generic iPhone builds passed.
  The variant installed and launched in the iOS 27 QA simulator, and its
  separate Xcode project opened with CapApp-SPM and all five plugins resolved.
- All 159 web files match the APK, native assets, and built iOS simulator app.
- Android signing certificate matches the standard debug build.

Delivered APK: /Users/imbatzy/Downloads/CozyCraft-1.0.85-No-Side-Menu.apk

The GitHub release asset digest records the published APK's SHA-256.

Browser checks use intercepted fixtures, not real purchases or newly created
customer accounts. Physical-phone behavior and live provider transactions were
not re-tested for this UI-only variant.
