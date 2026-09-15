# iOS 27 / Xcode 27 compatibility check

Checked September 15, 2026. Scope: the customer mobile app, not the website or admin app.

## Changes

- Added `scripts/xcode-toolchain.mjs`: package resolution, build checks and the launcher use the same exact Xcode bundle. It discovers supported installations in Applications and Downloads, honors `COZYCRAFT_XCODE_APP` / `DEVELOPER_DIR`, and fails on invalid explicit overrides.
- Restricted the old compiler-probe workaround to Xcode 26.6. Xcode 27 uses the normal compiler. The Mac's global `xcode-select` setting is not modified.
- Replaced the app's legacy `@UIApplicationMain` entry-point spelling with `@main`. Existing SceneDelegate lifecycle and URL handoff remain intact.
- Added eight toolchain regression tests and documented repeatable inspection/build commands in the README.
- Preserved the existing iOS 16 minimum deployment target, current UI, dependencies and backend contracts.

## Verified

- Xcode 27.0, build `27A266a`, was found in Downloads while command-line selection still pointed to Xcode 26.6 in Applications.
- Debug simulator build: passed using `iphonesimulator27.0`.
- Release arm64 device build (unsigned): passed using `iphoneos27.0`.
- Signed Debug build for Prince iPhone 17: passed using Xcode 27.0 / iOS 27 SDK.
- Signature verification passed. The provisioning profile includes the requested phone and expires September 21, 2026, 18:37:41 UTC.
- All 153 web files in the signed device bundle match the compiled source.
- Isolated iPhone 17 / iOS 27 simulator: launch, welcome screen, account-creation entry and name input were exercised. No account was submitted.
- 285 frontend tests, 18 native-shell tests, eight toolchain tests, frontend typecheck and native-shell lint passed. The browser reliability suite also reported 18 passing scenarios. These are not exhaustive physical-device tests.

## Physical installation and user confirmation

The user subsequently requested installation on Prince iPhone 17. The signed app was installed as an update without uninstalling it: `com.cozycraft.furniture`, version 1.0.74 / build 62.

The initial physical launch request was denied by iOS with `FBSOpenApplicationErrorDomain / Security`: invalid signature, inadequate entitlements or developer profile not explicitly trusted. Local signature verification, matching app/profile identifiers, device inclusion and profile expiry checks passed, and the user was asked to check developer trust on the phone.

On September 15, 2026, the user subsequently confirmed that the app was running and working properly on Prince iPhone 17, and authorized pushing the compatibility changes to the repository. The earlier launch blocker is therefore resolved according to the user's physical-device test. This is user-reported confirmation, not an additional automated end-to-end device test; the specific action that resolved the launch error was not reported.

Separately, the Downloads Xcode 27 installation disappeared after the successful builds. Only the Applications Xcode 26.6 installation was discoverable at the final check. Installation of the already-built iOS 27 app succeeded with the available device utility, but future Xcode 27 builds require locating or restoring Xcode 27. No global toolchain setting or Xcode installation was changed by this task.

## Repository publication scope

The follow-up publication is a source commit and push of these compatibility changes. Existing app version and release metadata remain unchanged; this is not a new GitHub binary release or App Store submission. No database migration, payment or customer account creation was performed during the compatibility work. Google authorization, payments, APNs and other signed-in flows are not individually certified by the compile/install checks or the user's general device confirmation.
