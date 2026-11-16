# API reference

Base path `/api`. Requests and responses are JSON. The session travels in an `httpOnly` cookie, so there is no token to send. Amounts are integers in the group currency's smallest unit: `125050` is ₱1,250.50 in a PHP group, and `1250` is ¥1,250 in a JPY group (yen and won have no decimals). The fields keep the name `…Centavos` whatever the currency. Dates are `YYYY-MM-DD`.

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

`GET /auth/payment-qrs` lists your saved payment QRs, oldest first, with the payee name read from each. The QR text itself is not returned.

```json
{ "methods": [{ "id": "5c1e…", "label": "GCash", "payeeName": "ANA REYES" }] }
```

`POST /auth/payment-qrs` saves one QR Ph (GCash, Maya or a bank's InstaPay QR, at most 512 characters), decoded in the browser, under a name of 1 to 40 characters. Returns `201` with the new method as above. `400` with `fields.payload` when it is not a valid QR Ph in pesos, `fields.label` when you already use that name, or a plain `400` past 5 QRs; `403` for the demo account.

```json
{ "label": "GCash", "payload": "00020101021127…5303608…5802PH5909ANA REYES…6304A1B2" }
```

`DELETE /auth/payment-qrs/:id` → `204`. `404` when it is not one of yours, `403` for the demo account.

## Groups

`GET /groups`

```json
{
  "groups": [
    {
      "id": "4c1e…",
      "name": "Unit 3B",
      "role": "admin",
      "currency": "PHP",
      "memberCount": 4,
      "netCentavos": 731985
    }
  ]
}
```

`POST /groups` → `201`. `currency` is one of `PHP`, `USD`, `EUR`, `JPY`, `SGD`, `KRW`, `HKD` and defaults to `PHP`; `400` with `fields.currency` for any other code.

```json
{ "name": "Tokyo trip", "currency": "JPY" }
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
  "currency": "PHP",
  "currencyLocked": true,
  "role": "admin",
  "members": [
    { "userId": "9b2f…", "name": "Ana", "role": "admin", "status": "active", "hasPaymentQr": true }
  ]
}
```

`PATCH /groups/:id` (admin) → `204`. Send either a new `name` or a new `currency`, not both. The currency can change only until the group's first expense or payment (`currencyLocked` above); after that it answers `409`, because amounts are never converted.

```json
{ "name": "Unit 3B Boarding House" }
```

```json
{ "currency": "USD" }
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

`GET /groups/:id/payment-qr?from=<userId>&to=<userId>` returns every QR the payee saved, each with the exact amount of that settle-up payment filled in, so the payer can pick one. The amount comes from the current `payments` above, never from the request. `404` when there is no such payment, the payee has no payment QR, or the group is not in pesos (QR Ph carries pesos only).

```json
{
  "amountCentavos": 666,
  "methods": [
    {
      "id": "5c1e…",
      "label": "GCash",
      "payeeName": "ANA REYES",
      "payload": "00020101021227…54066.665303608…6304C3D4"
    }
  ]
}
```

`GET /groups/:id/summary`

```json
{
  "byCategory": [{ "category": "food", "totalCentavos": 3200 }],
  "byMonth": [{ "month": "2026-11", "totalCentavos": 3200 }]
}
```

`GET /groups/:id/report?month=2026-11` downloads that month's expenses and payments as a CSV file (`text/csv`, sent as an attachment named `hati-<group-name>-<month>.csv`). Members only (`404` otherwise); `400` with `fields.month` unless the month is `YYYY-MM`. Amounts are plain numbers in the group's currency, named in the header; each member gets a share column. Cells that start with `=`, `+`, `-`, `@`, a tab or a carriage return get a leading `'`, so a spreadsheet shows them as text instead of running them. A month with nothing in it returns the header only. The file starts with a UTF-8 byte-order mark and uses CRLF line endings.

```csv
Date,Type,Description,Category,Paid by,Amount (PHP),Ana share,Ben share
2026-11-03,Expense,"Rice, eggs",Food,Ana,1250.50,625.25,625.25
2026-11-05,Payment,Paid Ana,,Ben,625.25,,
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
