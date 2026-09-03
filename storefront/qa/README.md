# Profile verification UI fixture

Run `npm run qa` from `storefront/`, then open `http://127.0.0.1:5174`.

This uses the actual mobile profile components with an in-memory Supabase adapter. The page cannot contact the production API: the adapter replaces the SDK, and its content security policy restricts network access to localhost. No real SMS is sent, and no customer data is changed.

- Use **Edit profile → Verify number**. The fixture's accepted code is `012345`.
- Any other code shows the service-error state.
- After success, check **Done → Change number → Keep current number**.
- Add `?platform=android` to select the Android CSS treatment.
- Add `?authenticator` to exercise an account protected by website two-step verification; its test code is also `012345`.

Check widths 320, 360, 390, 430 and 768 CSS pixels, a short landscape viewport, and enlarged text. The dialog must scroll vertically without horizontal clipping. The production build uses the normal Vite config and does not include these fixtures.
