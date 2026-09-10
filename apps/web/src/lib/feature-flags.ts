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

/**
 * Master switch for variable-size teams.
 *
 * When OFF the app behaves exactly as it did before teams existed: accepting a
 * request creates a two-person team that is born complete, which is indistinguishable
 * from the old "one accepted PartnerRequest = one match" model. Nothing can ever
 * become open, so no team can exceed two members.
 *
 * The schema, migration and backfill are deliberately NOT gated — a backfilled team
 * is by construction exactly an old match (2 members, isComplete = true), which is
 * what makes "off == before" true rather than approximate.
 *
 * Only three things are wired to this flag:
 *   - server/team-rules.ts (shapeDiscoveryEntry) — hides open teams from discovery
 *     and treats an open team as complete, so flipping this back off after teams
 *     have been opened degrades safely instead of leaking a half-built feature.
 *   - server/lab-partner.ts (setTeamCompletion) — refuses to open a team.
 *   - the completion toggles and the post-accept prompt in the UI.
 *
 * Everything else branches on team size, not on this flag, so a two-person team
 * renders with the original "partner" wording either way.
 */
export const TEAMS_ENABLED = true;
