# CozyCraft Furnitures Mobile

Native iOS and Android application for CozyCraft Furnitures, built with Ionic,
Angular, and Capacitor.

## Architecture

The Angular application provides the native shell, lifecycle handling, platform
integration, safe-area behavior, authentication callbacks, notifications, and
navigation bridge. The customer storefront is packaged under
`src/assets/original-frontend` and loaded inside that shell.

```text
.
├── src/                         Angular application and committed web assets
│   ├── app/                     Shell components, routing, and native bridge
│   ├── assets/original-frontend Bundled customer storefront
│   ├── environments/            Angular environment configuration
│   └── theme/                   Ionic theme tokens
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
npm run build
```

The committed storefront bundle makes the mobile shell buildable on a fresh
clone. When the editable storefront source is available separately, set
`COZYCRAFT_FRONTEND_ROOT` before preparing native projects:

```bash
COZYCRAFT_FRONTEND_ROOT=/path/to/storefront npm run native:prepare
```

Without that variable, the preparation script uses a sibling
`ORIGINAL FRONTEND` directory when present and otherwise keeps the committed
storefront bundle.

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

On Xcode 26.6, use `Open CozyCraft in Xcode.command` from Finder. It applies the
repository's compiler-probe workaround without hard-coding a developer's local
project path.

## Verification

```bash
npm run build
npm test -- --watch=false --browsers=ChromeHeadless
```

Android can be verified from the repository root with:

```bash
cd android
./gradlew :app:assembleDebug
```

Never commit `.env` files, private signing keys, provisioning profiles, local
SDK paths, or provider secret keys.
