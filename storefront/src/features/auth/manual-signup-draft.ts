// Keep only non-secret fields while reading Terms or returning from a route.
// Passwords and policy agreement are intentionally never retained here.
export type ManualSignupDraft = { first: string; last: string; username: string; email: string; step: number }
let draft: ManualSignupDraft = { first: "", last: "", username: "", email: "", step: 0 }
export const readManualSignupDraft = () => draft
export const saveManualSignupDraft = (next: ManualSignupDraft) => { draft = next }
export const clearManualSignupDraft = () => { draft = { first: "", last: "", username: "", email: "", step: 0 } }
