// In-memory only: survive a security/route remount without writing names to
// browser storage. Never reuse another customer's unfinished setup.
export type GoogleOnboardingDraft = {
  userId: string
  firstName: string
  lastName: string
  username: string
  nameConfirmed: boolean
}
let draft: GoogleOnboardingDraft | null = null

export function readGoogleOnboardingDraft(userId: string, displayName: string, username: string) {
  if (draft?.userId !== userId) {
    const [firstName = "", ...lastName] = displayName.trim().split(/\s+/)
    draft = { userId, firstName, lastName: lastName.join(" "), username, nameConfirmed: false }
  }
  return draft
}

export function saveGoogleOnboardingDraft(value: GoogleOnboardingDraft) { draft = value }
export function retainGoogleOnboardingDraftFor(userId: string) {
  if (draft?.userId !== userId) draft = null
}
export function clearGoogleOnboardingDraft(userId?: string) {
  if (!userId || draft?.userId === userId) draft = null
}
