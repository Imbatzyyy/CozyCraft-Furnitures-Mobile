# CozyCraft Furnitures Mobile

Native iOS and Android application for CozyCraft Furnitures, built with Ionic,
Angular, and Capacitor.

## Architecture

The Angular application provides the native shell, lifecycle handling, platform
integration, safe-area behavior, authentication callbacks, notifications, and
navigation bridge. The editable customer interface is a React storefront in
`storefront/`. Its production bundle is packaged under
`src/assets/original-frontend` and loaded inside the Angular shell. It is kept
inside this repository; native builds do not modify or rebuild the customer
website or a sibling project.

```text
.
├── src/                         Angular application and committed web assets
│   ├── app/                     Shell components, routing, and native bridge
│   ├── assets/original-frontend Bundled customer storefront
│   ├── environments/            Angular environment configuration
│   └── theme/                   Ionic theme tokens
├── storefront/                  Editable mobile customer interface
│   ├── src/features/            Profile verification and account security
│   ├── src/lib/                 Mobile API contracts and shared data access
│   ├── public/                  Bundled fonts and static assets
│   └── qa/                      Isolated, no-SMS profile UI fixture
├── android/                     Capacitor Android project
├── ios/                         Capacitor iOS project
├── scripts/                     Repeatable native build preparation
├── capacitor.config.ts          Shared Capacitor application configuration
└── angular.json                 Angular build and test configuration
```

Generated web output, Gradle/Xcode build products, dependency folders, IDE
state, APKs, and local signing material are intentionally excluded from Git.

## Requirements

- Node.js 22
- npm
- Android Studio and a compatible Android SDK for Android builds
- Xcode and an Apple development team for physical-device iOS builds

## Setup

```bash
npm ci
npm --prefix storefront ci
npm run build
```

The committed storefront bundle makes the Angular shell buildable on a fresh
clone. To update the customer interface, use `npm run storefront:dev` and then
`npm run native:prepare`. Native preparation builds `storefront/` before the
Angular shell, and installs its locked dependencies if they are missing.

An explicit source override remains available for development:

```bash
COZYCRAFT_FRONTEND_ROOT=/path/to/storefront npm run native:prepare
```

Without that variable, the preparation script always uses this repository's
`storefront/` directory. Do not point it at the customer website.

## Native development

```bash
npm run native:android
npm run cap:android
```

```bash
npm run native:ios
npm run cap:ios
```

The `native:android` and `native:ios` commands rebuild the Angular shell and
copy the resulting web application into the corresponding Capacitor project.

On Xcode 26.6, use `npm run cap:ios` or double-click
`Open CozyCraft in Xcode.command` from Finder. Both launch a fresh Xcode process
with the repository's compiler-probe workaround, so an older Xcode session
cannot leave Swift Package pre-planning stuck. No developer path is hard-coded.

## Verification

```bash
npm run build
npm --prefix storefront run typecheck
npm run storefront:test
npm test -- --watch=false --browsers=ChromeHeadless
```

Android can be verified from the repository root with:

```bash
cd android
./gradlew :app:assembleDebug
```

### Profile phone verification

The mobile profile uses the same authenticated `verify-customer-phone` function
as the customer website. Only that server function may update `profiles.phone`
and `profiles.phone_verified_at`; ordinary profile saves exclude both fields.
The app displays a verified badge only from a confirmed server response or the
saved database timestamp. Realtime profile changes and a deduplicated refresh
on app resume keep the app aligned with website changes without polling.

Accounts that already have an authenticator enabled on the website complete
the same Supabase two-step check before loading protected customer data. Device
sessions are registered through the existing server-validated RPC.

For responsive OTP UI testing without sending texts or changing customer data,
run `npm --prefix storefront run qa`. See `storefront/qa/README.md` for the
fixture code and viewport checks. The fixture is not included in native builds.
Real SMS delivery still requires a signed-in customer and the configured SMS
provider; never run automated tests against a real customer's number.

The storefront ships only the public Supabase project URL and publishable key.
Provider credentials and service-role keys belong only on the server.

Never commit `.env` files, private signing keys, provisioning profiles, local
SDK paths, or provider secret keys.
