# API reference

Base path `/api`. Requests and responses are JSON. The session travels in an `httpOnly` cookie, so there is no token to send. Amounts are integer centavos (`125050` is ₱1,250.50); dates are `YYYY-MM-DD`.

Every error has the same shape:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Check the highlighted fields.",
    "fields": { "name": "Too small" }
  }
}
```

| Status | Code                                  | Meaning                                             |
| ------ | ------------------------------------- | --------------------------------------------------- |
| 400    | `validation_error`                    | A field is wrong; `fields` says which               |
| 401    | `unauthorized`, `invalid_credentials` | Not signed in, or wrong email/password              |
| 403    | `forbidden`, `setup_required`         | Not allowed, or the account must finish setup first |
| 404    | `not_found`                           | Missing, or you are not a member                    |
| 409    | `conflict`                            | The action is not possible right now                |
| 429    | `rate_limited`                        | Too many attempts; see `Retry-After`                |

Writes (anything but `GET`) must carry this site's `Origin` header, which browsers add themselves.

## System

`GET /health`

```json
{ "status": "ok" }
```

`GET /cron/daily` with `Authorization: Bearer <CRON_SECRET>` resets the demo and prunes expired rows.

```json
{ "status": "ok" }
```

## Auth

`GET /auth/providers`

```json
{
  "google": true,
  "github": true,
  "demo": { "email": "demo@hati.example", "password": "hati-demo-2026" }
}
```

`GET /auth/:provider/start?next=/groups` (`google` or `github`) redirects to the provider. `GET /auth/:provider/callback` finishes sign-in, sets the cookie and redirects to `next`.

`GET /auth/me` returns `null` when nobody is signed in.

```json
{
  "user": {
    "id": "9b2f…",
    "name": "Ana",
    "username": "ana",
    "email": "ana@example.com",
    "status": "active",
    "isDemo": false
  },
  "authMethod": "oauth"
}
```

`POST /auth/sign-in` → `204`

```json
{ "email": "ana@example.com", "password": "correct-horse-battery" }
```

`POST /auth/setup` → `204`. Finishes a new account: `username` (3 to 20 lowercase letters, numbers or underscores, unique, cannot be changed) and, for an account with no password yet, `password`. `409` with `fields.username` when the username is taken, `409` when the account is already set up.

```json
{ "username": "ana", "password": "correct-horse-battery" }
```

`POST /auth/password` → `204`. Changes the password of a set-up account (`currentPassword` is needed unless the session came from Google or GitHub).

```json
{ "password": "a-new-long-password", "currentPassword": "correct-horse-battery" }
```

`POST /auth/sign-out` → `204`

## Groups

`GET /groups`

```json
{
  "groups": [
    { "id": "4c1e…", "name": "Unit 3B", "role": "admin", "memberCount": 4, "netCentavos": 731985 }
  ]
}
```

`POST /groups` → `201`

```json
{ "name": "Unit 3B" }
```

```json
{ "id": "4c1e…" }
```

`GET /groups/:id`

```json
{
  "id": "4c1e…",
  "name": "Unit 3B",
  "inviteCode": "K7M2XQ9P",
  "role": "admin",
  "members": [{ "userId": "9b2f…", "name": "Ana", "role": "admin", "status": "active" }]
}
```

`PATCH /groups/:id` (admin) → `204`

```json
{ "name": "Unit 3B Boarding House" }
```

`DELETE /groups/:id` (admin) → `204`

`POST /groups/:id/invite-code` (admin) replaces the invite code.

```json
{ "inviteCode": "R4T8WZ3N" }
```

`GET /invites/:code`

```json
{ "groupId": "4c1e…", "name": "Unit 3B", "memberCount": 4, "alreadyMember": false }
```

`POST /invites/:code/join`

```json
{ "groupId": "4c1e…" }
```

`PATCH /groups/:id/members/:userId` (admin) → `204`

```json
{ "role": "admin" }
```

`DELETE /groups/:id/members/:userId` → `204`. Your own id leaves the group; another id removes that member (admin). Returns `409` while the member's balance is not zero.

## Balances and summary

`GET /groups/:id/balances`. A positive `netCentavos` means the person is owed money.

```json
{
  "balances": [
    { "userId": "9b2f…", "netCentavos": 666 },
    { "userId": "71aa…", "netCentavos": -666 }
  ],
  "payments": [{ "fromUser": "71aa…", "toUser": "9b2f…", "amountCentavos": 666 }]
}
```

`GET /groups/:id/summary`

```json
{
  "byCategory": [{ "category": "food", "totalCentavos": 3200 }],
  "byMonth": [{ "month": "2026-11", "totalCentavos": 3200 }]
}
```

## Expenses

Lists take `?limit=` (1 to 50, default 20) and `?offset=`; `nextOffset` is `null` on the last page.

`GET /groups/:id/expenses`

```json
{
  "items": [
    {
      "id": "e7d0…",
      "description": "Lunch",
      "amountCentavos": 1000,
      "category": "food",
      "splitType": "equal",
      "spentOn": "2026-11-01",
      "paidBy": "9b2f…",
      "createdBy": "9b2f…",
      "createdAt": "2026-11-01T04:12:09.120Z",
      "shares": [
        { "userId": "9b2f…", "shareCentavos": 500 },
        { "userId": "71aa…", "shareCentavos": 500 }
      ]
    }
  ],
  "nextOffset": null
}
```

`POST /groups/:id/expenses` → `201 { "id": "e7d0…" }`. `split` is one of three shapes:

```json
{
  "description": "Lunch",
  "amountCentavos": 1000,
  "category": "food",
  "spentOn": "2026-11-01",
  "paidBy": "9b2f…",
  "split": { "type": "equal", "participants": ["9b2f…", "71aa…"] }
}
```

```json
{
  "type": "exact",
  "shares": [
    { "userId": "9b2f…", "amountCentavos": 700 },
    { "userId": "71aa…", "amountCentavos": 300 }
  ]
}
```

```json
{
  "type": "percent",
  "shares": [
    { "userId": "9b2f…", "percent": 62.5 },
    { "userId": "71aa…", "percent": 37.5 }
  ]
}
```

Categories: `rent`, `utilities`, `groceries`, `food`, `transport`, `supplies`, `fun`, `other`.

`PUT /groups/:id/expenses/:expenseId` → `204`, same body as `POST`. `DELETE /groups/:id/expenses/:expenseId` → `204`. Both are limited to the person who added it, the payer, or an admin.

## Payments (settlements)

`GET /groups/:id/settlements`

```json
{
  "items": [
    {
      "id": "a1c9…",
      "fromUser": "71aa…",
      "toUser": "9b2f…",
      "createdBy": "71aa…",
      "amountCentavos": 500,
      "settledOn": "2026-11-02",
      "createdAt": "2026-11-02T01:00:00.000Z"
    }
  ],
  "nextOffset": null
}
```

`POST /groups/:id/settlements` → `201 { "id": "a1c9…" }` (payer, receiver or admin)

```json
{ "fromUser": "71aa…", "toUser": "9b2f…", "amountCentavos": 500, "settledOn": "2026-11-02" }
```

`DELETE /groups/:id/settlements/:settlementId` → `204` (whoever recorded it, or an admin)

## Activity

`GET /groups/:id/activity`

```json
{
  "items": [
    {
      "id": 42,
      "actorName": "Ana",
      "action": "expense_added",
      "summary": "added \"Lunch\" for ₱10.00",
      "createdAt": "2026-11-01T04:12:09.120Z"
    }
  ],
  "nextOffset": null
}
```

## Live updates (WebSocket)

Connect to `wss://<host>/api/ws` from the site (the cookie and `Origin` are checked on the upgrade). Then subscribe:

```json
{ "type": "subscribe", "groupId": "4c1e…" }
```

The server answers `{ "type": "subscribed", "groupId": "…" }` or `{ "type": "denied", "groupId": "…" }`, and afterwards sends one message per change:

```json
{ "type": "changed", "groupId": "4c1e…", "action": "expense_added" }
```

The message carries no data: refetch what you show. Connections are closed after at most five minutes on Vercel; reconnect and refetch.
