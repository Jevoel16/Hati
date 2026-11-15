# Deploying to Vercel

Hati deploys as one Vercel project: the built React app is served as static files, and `api/server.ts` is a single Vercel Function that answers both the REST API and the WebSocket.

## 1. Database (TiDB Cloud)

1. Create a TiDB Cloud Serverless cluster and a database named `hati`.
2. Create a SQL user for the app that can only use that database (not `root`), and note its connection details.
3. Build the URL: `mysql://<user>:<password>@<host>:4000/hati`. TLS is turned on automatically for any host that is not `localhost`.

Local development uses MySQL 8 instead (created in MySQL Workbench), on `mysql://<user>:<password>@127.0.0.1:3306/hati` ([decision 15](decisions.md#15-mysql-8-locally-tidb-when-deployed)). For running the API tests locally, also set `TEST_DATABASE_URL` to a user that may create and drop databases named `hati_test_*`.

## 2. OAuth apps

Create one app per provider and per environment (local and production use different callback URLs).

| Provider | Where                                                                                    | Callback URL                         |
| -------- | ---------------------------------------------------------------------------------------- | ------------------------------------ |
| Google   | Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web application) | `<APP_URL>/api/auth/google/callback` |
| GitHub   | GitHub → Settings → Developer settings → OAuth Apps                                      | `<APP_URL>/api/auth/github/callback` |

Google scopes: `openid`, `email`, `profile`. GitHub needs no extra setup; the app asks for `read:user user:email`.

## 3. Vercel project

1. Push the repository to GitHub and import it in Vercel. `vercel.json` already sets the build command, output folder, rewrites, headers and the daily cron.
2. In Project Settings → Environment Variables, add for Production: `APP_URL` (the final `https://` address, no trailing slash), `DATABASE_URL`, `JWT_SECRET` (32+ random characters), `CRON_SECRET` (16+ random characters), and the four OAuth variables. Set `NODE_ENV=production`.
3. Check that Fluid compute is on (Settings → Functions). It is the default for new projects and is required for WebSockets.
4. Deploy. The build runs the migrations and resets the demo account before building the site, so the first deploy creates the schema.

Every push to `main` deploys through Vercel's Git integration; GitHub Actions only runs the checks.

## 4. After the first deploy

- `https://<host>/api/health` returns `{ "status": "ok" }`.
- "Open the demo" on the sign-in page works.
- Google and GitHub sign-in complete and ask for a password the first time.
- Open one group on two devices; adding an expense on one updates the other within about a second.

## Things to know

- **WebSockets on Vercel are in public beta.** A connection ends when the function reaches `maxDuration` (300 s, set in `vercel.json`; the Hobby maximum). The app reconnects on its own.
- **If the socket never connects,** the likely cause is the `/api/ws` rewrite. The server also accepts upgrades on the function's own path, `/api/server`; change the path in `web/src/lib/hooks.ts`.
- **Preview deployments** use the same variables unless you override them, so they migrate and reseed the same database. Give Preview its own `DATABASE_URL` and `APP_URL`.
- **Cron** runs once a day on the Hobby plan, at some point in the hour after 18:00 UTC (02:00 in Manila).

## Docker (development, as in the proposal)

`docker compose up --build` starts three containers: TiDB, the API and nginx serving the built site at http://localhost:8080. These files have not been run on the development machine, which has no Docker installed.
