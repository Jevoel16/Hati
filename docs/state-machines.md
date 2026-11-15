# State machines

Every machine has one status field, one transition function and tests for each allowed transition plus at least one rejected one. Anything not in a table is rejected (server) or ignored (client).

## Account

- **Owner:** `server/src/domain/machines.ts` (`transitionAccount`), used by `server/src/services/auth.ts`
- **Stored as:** `users.status` (`ENUM`); `password_hash` is missing only in `password_pending`, `username` is set only in `active`

| State              | Event              | Next state |
| ------------------ | ------------------ | ---------- |
| `password_pending` | `setup_completed`  | `active`   |
| `username_pending` | `username_set`     | `active`   |
| `active`           | `password_changed` | `active`   |

A new Google or GitHub account starts in `password_pending` and finishes setup with a username and a password together. Accounts made before usernames existed were moved to `username_pending` by migration 002 and only choose a username. Until an account is `active` it can only read its profile, finish setup (`POST /auth/setup`) and sign out; every other route returns `403 setup_required` (`requireActive`).

## Group membership

- **Owner:** `server/src/domain/machines.ts` (`transitionMember`), used by `server/src/services/groups.ts`
- **Stored as:** `group_members.status` (`ENUM`)

| State    | Event    | Next state |
| -------- | -------- | ---------- |
| `active` | `leave`  | `left`     |
| `active` | `remove` | `left`     |
| `left`   | `rejoin` | `active`   |

Guards checked before `leave` and `remove`: the balance is zero, and the group keeps at least one admin.

## Remote data (client)

- **Owner:** `web/src/lib/machines.ts` (`remoteReducer`), used by `useRemote` and `usePagedList`
- **Rendered by:** `RemoteView`, an exhaustive `switch` with one screen per state

| State     | Event                     | Next state                     |
| --------- | ------------------------- | ------------------------------ |
| `loading` | `loaded`                  | `success` (with `data`)        |
| `loading` | `failed`                  | `failed` (with `message`)      |
| `success` | `loaded`                  | `success` (new `data`)         |
| `success` | `failed`                  | `success` (keeps showing data) |
| `success` | `failed` with `not_found` | `failed` (access was lost)     |
| `failed`  | `reload`                  | `loading`                      |
| `failed`  | `loaded`                  | `success`                      |

## Form submission (client)

- **Owner:** `web/src/lib/machines.ts` (`submissionReducer`), used by `useSubmission`

| State        | Event       | Next state                          |
| ------------ | ----------- | ----------------------------------- |
| `editing`    | `submit`    | `submitting`                        |
| `submitting` | `succeeded` | `editing`                           |
| `submitting` | `failed`    | `failed` (with `message`, `fields`) |
| `failed`     | `submit`    | `submitting`                        |

A second `submit` while `submitting` is ignored, so a double click cannot save twice.

## Live connection (client)

- **Owner:** `web/src/lib/machines.ts` (`liveTransition`), used by `useLive`

| State          | Event     | Next state     |
| -------------- | --------- | -------------- |
| `connecting`   | `opened`  | `open`         |
| `connecting`   | `dropped` | `reconnecting` |
| `open`         | `dropped` | `reconnecting` |
| `reconnecting` | `opened`  | `open`         |
| `reconnecting` | `dropped` | `reconnecting` |
| any but closed | `denied`  | `closed`       |
| any but closed | `stopped` | `closed`       |

`closed` is final. Each `reconnecting` state schedules a retry after 1 s, 2 s, 4 s and so on, capped at 15 s.

## Page shell (client)

`web/src/components/Layout.tsx` picks one screen from the session and account state: loading, failed, signed out (redirect to sign-in), `password_pending` (username and password dialog), `username_pending` (username dialog) or the page, with an exhaustive `switch` on the account status.
