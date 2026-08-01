/**
 * Master switch for the email-verification system.
 *
 * Currently OFF. McMaster's Microsoft 365 tenant quarantines mail from new
 * sending domains and blocks third-party OAuth (admin consent required), so
 * neither automated proof-of-email-ownership path is reliable. The @mcmaster.ca
 * gate at signup plus the MacID-authenticated import step are the effective
 * identity checks for now.
 *
 * The full verification system is intentionally left in place and wired to this
 * flag — nothing is deleted. Flip this to `true` (and ensure RESEND_API_KEY /
 * EMAIL_FROM / NEXT_PUBLIC_APP_URL are set) to re-enable, end-to-end:
 *   - auth.ts               — blocks login until emailVerified
 *   - server/registration.ts — new accounts start unverified
 *   - api/auth/register      — sends the verification email + tells the client
 *   - auth/signup form       — routes to the /auth/verify-email screen
 *   - api/auth/verify-email + /verify-email/resend + the resend button UI
 */
export const EMAIL_VERIFICATION_ENABLED = false;
