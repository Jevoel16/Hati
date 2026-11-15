# Security

How Hati meets each item of the project security checklist. File paths point to where the rule lives.

| #   | Item                         | How                                                                                                                                                                                          |
| --- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Admin routes protected       | `requireAdmin` in `server/src/services/groups.ts` guards rename, delete, roles, removal and invite codes.                                                                                    |
| 2   | Access control on the server | Every group route calls `requireMember` or `requireAdmin` in its service; the UI only hides buttons.                                                                                         |
| 3   | Per-user data scoping        | Every query takes the `group_id` and runs only after the caller's active membership row is found. Non-members get 404, so group ids cannot be probed.                                        |
| 4   | Verified email               | Accounts are created only from a Google or GitHub identity whose email the provider reports as verified (`services/oauth.ts`).                                                               |
| 5   | Password hashing             | bcrypt, cost 12 (`services/auth.ts`).                                                                                                                                                        |
| 6   | No tokens in `localStorage`  | The session is an `httpOnly`, `Secure`, `SameSite=Lax` cookie (`middleware/session.ts`).                                                                                                     |
| 7   | Secrets stay on the server   | The web bundle reads no environment variables except the public site URL at build time.                                                                                                      |
| 8   | `.env` out of git            | `.gitignore` covers `.env*`; `.env.example` has placeholders only.                                                                                                                           |     | 9   | No secrets in logs | Only error messages and stacks are logged; request bodies, cookies and tokens never are. |
| 10  | Parameterized SQL            | All values go through `?` placeholders (`server/src/db.ts`). The only interpolated names are constants in the code.                                                                          |
| 11  | Server-side validation       | Zod schemas in `routes/schemas.ts` parse every body, parameter and query.                                                                                                                    |
| 12  | XSS                          | React escapes all output; no `dangerouslySetInnerHTML`. A strict CSP is set in `vercel.json` (pages) and by helmet (API).                                                                    |
| 13  | Uploads                      | Does not apply: there are no uploads.                                                                                                                                                        |
| 14  | Webhooks                     | Does not apply: there are no webhooks. The cron route checks `CRON_SECRET` with a constant-time compare.                                                                                     |
| 15  | Rate limiting                | 10 sign-in attempts per minute per client and 60 writes per minute per user, counted in the database (`middleware/guards.ts`).                                                               |
| 16  | CORS                         | None is enabled: the site and API share one origin, so no other origin may read responses.                                                                                                   |
| 17  | No debug output              | The central error handler returns a fixed message for unexpected errors; stacks stay in the server log.                                                                                      |
| 18  | Dependencies                 | CI runs `npm audit --audit-level=high`.                                                                                                                                                      |
| 19  | Security scan                | `/security-review` before each release.                                                                                                                                                      |
| 20  | CSRF                         | `SameSite=Lax` plus an `Origin` check on every non-GET request and on the WebSocket upgrade (`requireSameOrigin`).                                                                           |
| 21  | Security headers             | `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (camera for this site only, for QR scanning), HSTS and `frame-ancestors 'none'` in `vercel.json`; helmet on API responses. |
| 22  | Sessions                     | A new session row per sign-in; 7-day idle expiry; sign-out deletes the row; a password change deletes every session and issues a fresh one.                                                  |
| 23  | No account enumeration       | Wrong password and unknown email return the same response, and a dummy hash is compared so both take the same time.                                                                          |
| 24  | Access-control tests         | `server/src/groups.test.ts` proves outsiders get 404, members cannot use admin routes and uninvolved members cannot change others' entries.                                                  |
| 25  | Limits                       | 32 kB request bodies, page size capped at 50, 10-second query timeout, 1 kB WebSocket messages, maximum amounts and lengths.                                                                 |
| 26  | Redirects                    | The post-sign-in destination must match a same-site path pattern. The server fetches only fixed Google and GitHub URLs.                                                                      |
| 27  | Secret scanning              | gitleaks runs in CI.                                                                                                                                                                         |
| 28  | Least privilege and data     | Use a database user limited to the Hati schema (see `docs/deploy.md`). Only name and email are stored; other members see names only.                                                         |
| 29  | This document                | Linked from the README.                                                                                                                                                                      |

## Analytics

Page views are counted with Vercel Web Analytics. It sets no cookies and needs no key in the bundle. Its script and reports use `/_vercel/insights` on the site's own origin, so the CSP allows no outside origin for it. Group ids, invite codes and query strings are stripped from every reported address before it leaves the browser (`web/src/lib/analytics.ts`).

## Known limits

- TiDB enforces `CHECK` constraints only when `tidb_enable_check_constraint` is on, so amounts and totals are validated in the application as well.
- An open WebSocket is not re-checked when its session expires. Vercel closes every socket within five minutes, and each reconnect is authenticated again.
