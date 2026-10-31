/**
 * Browser storage that belongs to the signed-in account (P1 exit review X3). It is cleared whenever this
 * browser stops being signed in — sign-out, or a refresh the API refuses — so nothing saved by one account is
 * ever sent with, or shown to, the next account that signs in here. Guest marks (`READ_GUEST_KEY`) are not the
 * account's: they stay until a sign-in merges them into the account.
 */
export const OUTBOX_KEY = "vl:outbox"; // sessionStorage: saves waiting for the API (lib/outbox.ts)
export const REVIEW_DRAFT_KEY = "vl:review-draft"; // sessionStorage: ratings not yet handed to the outbox
export const READ_ACCOUNT_KEY = "vl:read:account"; // localStorage: the account's lessons, mirrored for display
export const READ_GUEST_KEY = "vl:read"; // localStorage: "Mark as read" while signed out

export function clearAccountData(): void {
  try {
    sessionStorage.removeItem(OUTBOX_KEY);
    sessionStorage.removeItem(REVIEW_DRAFT_KEY);
    localStorage.removeItem(READ_ACCOUNT_KEY);
  } catch {}
}
