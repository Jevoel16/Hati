# Decisions

Short records of the choices that are not obvious from the code.

## 1. Everything on Vercel, including the WebSocket

- **Problem:** the proposal put the API on Render, whose free server sleeps after 15 idle minutes and takes up to a minute to wake.
- **Options:** Vercel for the site + Render for the API; everything on Vercel.
- **Choice:** everything on Vercel. Vercel Functions accept WebSocket connections (public beta since June 2026), so the site, API and socket share one origin.
- **Trade-off:** it is a beta, and a connection is closed when the function reaches its maximum duration (300 s on the Hobby plan). The client treats a close as normal: it reconnects with backoff and refetches. One origin also means the session cookie is first-party and no CORS is needed.

## 2. TiDB instead of PostgreSQL

- **Problem:** the proposal named PostgreSQL; the team already uses TiDB.
- **Choice:** TiDB Cloud Serverless through `mysql2`.
- **Trade-off:** TiDB has no triggers and no `LISTEN/NOTIFY`, and enforces `CHECK` only when a server setting is on. So the "shares add up to the amount" rule is enforced in code and re-checked from the stored rows before each transaction commits, statuses use `ENUM` columns (always enforced), and live updates use polling (decision 3).

## 3. Live updates by polling a small events table

- **Problem:** serverless instances do not share memory, so the instance that saves an expense cannot reach sockets held by another instance.
- **Options:** Redis pub/sub (a new service and dependency); a third-party realtime service; polling the database.
- **Choice:** every write inserts a row into `group_events` in the same transaction. Each instance that has subscribers polls that table once a second and forwards new events to its own sockets.
- **Trade-off:** up to about a second of delay and one small indexed query per second per busy instance. The poll looks back 5 seconds and de-duplicates by id, because TiDB auto-increment ids are unique but not strictly increasing, and a slow commit must not be missed.

## 4. The socket says "changed", not what changed

- **Choice:** the WebSocket message is `{ type: "changed", groupId, action }`. The browser then refetches balances over REST.
- **Why:** no money data travels over the socket, the REST endpoints stay the single place where access is checked, and recovering from a dropped connection is the same code path as any other update.

## 5. Money is integer centavos

- **Choice:** amounts are stored and computed as whole centavos. Leftover centavos in an equal split go to the first people in the list; in a percentage split they go to the largest remainders.
- **Why:** floats cannot represent amounts like 0.10 exactly. With integers, the shares of an expense always sum to its amount and all balances always sum to zero (the code throws if they do not).

## 6. "Fewest payments" is a greedy algorithm

- **Choice:** repeatedly let the person who owes most pay the person owed most.
- **Trade-off:** this settles n people in at most n−1 payments. Finding the true minimum is NP-hard (it contains subset-sum), and the greedy result is the minimum in almost every real group.

## 7. OAuth sign-up, then a password

- **Choice:** accounts are created through Google or GitHub; the first sign-in must set a password before anything else works.
- **Why:** the provider has already verified the email, so no verification emails are needed. The password gives a second way in. A forgotten password is reset by signing in through the provider again.
- **Trade-off:** hand-written OAuth code flow (state + PKCE) instead of a library, to avoid a dependency for about 150 lines.

## 8. A signed cookie that points at a session row

- **Choice:** the cookie holds a JWT containing only a session id; every request looks the session up.
- **Why:** a bare JWT cannot be revoked. With a row, sign-out and password changes end sessions immediately, at the cost of one indexed lookup per request.

## 9. Rate limits live in the database

- **Choice:** a fixed-window counter in the `rate_limits` table.
- **Why:** an in-memory counter resets with every serverless instance and is not shared between them.

## 10. Members who leave are kept as "left"

- **Choice:** leaving sets the membership status to `left`; the row stays.
- **Why:** old expenses still refer to that person. A member can only leave or be removed with a zero balance.

## 11. One package, no workspaces

- **Choice:** a single `package.json` with `server/` and `web/` folders.
- **Why:** Vercel builds one project from the root, and the two halves share almost every tool.

## 12. The demo account is fenced off

- **Choice:** the demo account cannot join real groups, real users cannot join demo groups, and its password cannot be changed. A daily cron wipes and rebuilds its sample group.
- **Why:** its password is public by design.
