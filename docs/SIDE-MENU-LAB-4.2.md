# Lab Activity 4.2 — CozyCraft mobile side menu

## Scope and design

This implementation is exclusive to the **customer mobile app**, in the
`COZYCRAFT MOBILE` repository. The customer website, shared CMS, database,
authentication rules, checkout, and bottom navigation are not replaced.

Open the hamburger button beside the CozyCraft logo. The ivory drawer uses the
app's existing serif headings, sage accents, rounded controls, and readable text
preferences. A sage background marks the selected destination. The menu's own
scrolling area keeps its close button accessible on small/landscape screens.

## Requirement mapping

| Lab requirement | Implementation |
| --- | --- |
| Side menu with existing modules | Home, Shop furniture, Wishlist, Shopping bag, My orders, Home Circle, My account, Care & support |
| About the App | Purpose and four feature summaries, with working collection/team links |
| Developers | Five members, supplied/website portraits, and approved email links |
| Responsive hamburger/toggle | 44-pixel minimum toggle/close targets; bounded drawer width; scrollable content; responsive developer grid |
| Active state | `aria-current="page"` and a matching visible highlight |
| Smooth transitions | Short transform/opacity animations; no continuous animation, new animation library, or backdrop blur |
| Reduced-motion/economy support | Instant reduced-motion dismissal; shortened economy-device transitions |
| Functional navigation | Uses existing storefront handlers; preserves its mounted state and cart |
| Accessible controls | Named dialogs, background inert/hidden while open, focus containment/return, Escape, backdrop and native Back dismissal |

## Source map

- `storefront/src/features/navigation/AppNavigation.tsx`: trigger, drawer,
  information-page container, focus/Back handling, and guarded close transition.
- `storefront/src/features/navigation/app-navigation-data.ts`: reusable menu
  configuration and **app-only** developer roster/contact data.
- `storefront/src/features/navigation/AppInformation.tsx`: About/Developers
  content. Email links hand off to the device's configured mail application.
- `storefront/src/features/navigation/app-navigation.css`: scoped layout,
  active states, safe areas, text sizing, and motion preferences.
- `storefront/src/Storefront.tsx`: integration with existing destinations;
  pauses tutorial/voucher presentation and pull-to-refresh while the menu is open.
- `storefront/public/team/`: bundled portraits, available without a remote image
  service. Portraits use lazy loading and asynchronous decoding.
- `storefront/src/features/navigation/AppNavigation.test.tsx`: regression tests.
- `storefront/qa/app-navigation-audit.mjs`: browser checks against the full app
  with all Supabase HTTP/WebSocket traffic intercepted locally.

## Approved app roster

| Member | Email |
| --- | --- |
| Prince Balane | qpcbalane@tip.edu.ph |
| Joylyn Campuso | qjccampuso@tip.edu.ph |
| Sammuel Guill Concepcion | qsgconcepcion@tip.edu.ph |
| Angela Faith Suba | qafcsuba@tip.edu.ph |
| Hydee Mae Sumalinog | qhmusumalinog@tip.edu.ph |

Sammuel replaces Jacob only in this app roster, using the supplied photograph.
The spelling follows the user's final contact-list message. Other four roles
and portraits are retained from the website; Sammuel is labeled Development
Team rather than attributing an unconfirmed specialty.

## Run the checks

```sh
npm --prefix storefront run typecheck
npm --prefix storefront test
npm --prefix storefront run build
npm --prefix storefront run preview -- --port 5198
```

In a second terminal, with Playwright and its Chrome/WebKit browsers available:

```sh
APP_URL=http://127.0.0.1:5198 node storefront/qa/app-navigation-audit.mjs
```

Set `PLAYWRIGHT_MODULE` to an installed Playwright module path if it is not
resolvable from this checkout. Set `QA_OUTPUT` to select a screenshot directory.
The test never writes to the real backend. Its screenshots show real app UI
with controlled catalog/account fixture data, not production customer data.

## Submission checklist

- Source: the files above and their integration are included in the repository.
- Screenshots: expanded desktop drawer, collapsed mobile header, About the App,
  and Developers are in `docs/side-menu-screenshots/`.
- **Still to record:** the professor requests a 3–5 minute narrated screen
  recording and a viewable Google Drive/YouTube link. This task does not upload
  anything to those accounts or fabricate a recording link.
- **Reflection:** write your own 200–300 words covering the design approach,
  responsive layering/focus challenges, navigation benefits, and future ideas.

Suggested recording sequence: introduce CozyCraft; open/close the menu; show
Shop/Wishlist/Bag/Account and the selected state; open Orders and Care; visit
About and Developers; show the five contacts; resize/rotate the screen; finish
by showing the original bottom navigation still works.

## Device acceptance

After installing the new native build, check portrait/landscape on iPhone and
Android, larger text, Reduce Motion, Back/Escape, repeated taps, and each email
link with a mail app configured. Browser emulation and compilation do not
replace physical VoiceOver/TalkBack, device mail handoff, or frame-rate testing.
