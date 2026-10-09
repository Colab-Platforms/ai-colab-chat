# Vercel integration

Publishes a `CodeProject` to the **user's own Vercel account**, either straight from the `CodeFile` rows or from a linked GitHub repository.

Vercel is a *destination, never a source of truth*: nothing is ever pulled back, `CodeFile` stays authoritative, and the whole feature is optional. The deploy runs on the user's own plan — there is no billing gate and no credit deduction on our side.

The frontend half lives in `frontend/features/code-workspace/vercel/`.

## Runs with an empty `.env`

Nothing here reads env vars at module load. `isVercelConfigured()` is a cheap boolean; `getVercelConfig()` throws an `ApiError` only when *called*. So:

- the server boots normally with zero `VERCEL_*` vars,
- `GET /api/vercel/status` answers `{ configured: false }` without touching the database, and the frontend hides the Publish button entirely,
- no AI turn is affected — unlike GitHub, there is no auto-deploy hook anywhere.

Filling the vars in later switches the feature on with no code change.

## Setup

1. Vercel dashboard → **Integrations → Create** (the Integration Console). Set a name and a URL slug.
2. **Redirect URL** → `VERCEL_CALLBACK_URL`. A `localhost` URL is fine for development: Vercel only redirects the *user's browser* there, so unlike the GitHub App (whose webhooks are server-to-server) no tunnel is needed.
3. **API Scopes**: `user` Read · `team` Read · `project` Read/Write · `deployment` Read/Write · `project-env-vars` Read/Write · `integration-configuration` Read/Write (the last one is only used to revoke the install on disconnect).
4. Leave it **Unlisted** — an unlisted "community" integration is installable by direct link, so no marketplace review is needed.
5. Fill `backend/.env`:

```
VERCEL_CLIENT_ID=
VERCEL_CLIENT_SECRET=
VERCEL_INTEGRATION_SLUG=        # the URL slug: vercel.com/integrations/<slug>
VERCEL_CALLBACK_URL=            # https://api.example.com/api/vercel/callback  (= the Redirect URL above)
FRONTEND_VERCEL_CALLBACK_URL=   # https://app.example.com/vercel/callback
TOKEN_ENCRYPTION_KEY=           # openssl rand -hex 32 — shared with the GitHub module
```

`JWT_SECRET` (signs the OAuth state) and `DATABASE_URL` are reused.

6. `npx prisma db push && npm run db:generate`.

## Token (`vercel.app.ts`)

| Token | Obtained from | Lifetime | Used for |
|---|---|---|---|
| Integration access token | `code` → `POST /v2/oauth/access_token` | long-lived, **no refresh flow** | every Vercel API call |

Much simpler than GitHub's three-token dance: one Bearer per installation, AES-256-GCM encrypted at rest (`utils/crypto.ts`), never leaving the server. Because there is no refresh, a token Vercel rejects is terminal — `vercel.api.ts` flips `VercelConnection.isActive` to false and the UI asks for a reconnect.

Two rules the rest of the module depends on:

- **`teamId` goes on every request.** When the user installs onto a Team, `team_id` comes back from the token exchange and *every* later call needs `?teamId=…` or Vercel answers 403. `vercelPath()` in `vercel.api.ts` is the only place a Vercel URL is built, so this cannot be forgotten.
- **Nothing here ever returns 401.** The frontend's axios interceptor logs the user out of the whole app on any 401, and a dead Vercel token is not a dead app session. A revoked token becomes a 409 with `code: "VERCEL_REAUTH"`.

## Publish without GitHub (`source = FILES`)

`readFiles()` → inline `files` on `POST /v13/deployments`.

1. Editor edits are snapshotted as a `USER` version first (`snapshotUserEditsIfDirty`), exactly as the GitHub Push button does, so "what's live" maps to exactly one `CodeProjectVersion`.
2. Every path goes through the code workspace's own `normalizeCodePath()` — a `..` segment would be a write outside the build root. Content is base64 so JSX, emoji and odd bytes survive the JSON round trip.
3. Above `MAX_DEPLOY_BYTES` (8 MB of base64) the deploy is refused with `PROJECT_TOO_LARGE` and the user is pointed at the GitHub path. Projects are text-only and capped at 80 files, so real ones are ~100 KB; the `POST /v2/files` blob flow is deliberately out of scope.
4. The Vercel project is created/updated *before* the deployment, because env vars have to exist before the first build.

## Publish with GitHub (`source = GIT`)

`POST /v11/projects` with `gitRepository` → `POST /v13/deployments` with `gitSource`.

`files` and `gitSource` are mutually exclusive, so a project first published from the workspace and later git-linked goes through `POST /v9/projects/{id}/link` first.

The payoff is that the Vercel project is *genuinely* git-linked: later pushes redeploy on Vercel's own trigger, which is why this module has no equivalent of `GithubRepoLink.autoPush`.

### The guided detour

Vercel can only build a repo if the **user's Vercel account** is linked to GitHub and Vercel's own GitHub App can see that repo. When it isn't, Vercel answers 400/403 with wording like *"To link a GitHub repository, you need to install the GitHub integration first."*

`isGitIntegrationMissing()` detects that (a code allowlist **and** a message regex, since Vercel's code for it is not stable) and the module throws `VERCEL_GIT_NOT_CONNECTED` with both pages the user needs. The dialog then shows a three-step panel and a manual **"I've done this — Deploy again"**.

The retry is manual on purpose: neither Vercel's authentication settings nor GitHub's app-install page calls back to us, so auto-retrying on popup close would just fail twice. Nothing is persisted on this failure, so the retry is clean.

**This is the single most likely path to regress** — Vercel changes the wording, and `isGitIntegrationMissing()` is the one function to fix.

## Logs (`vercel.logs.ts`)

Two upstream sources, on purpose:

| Source | What it gives | Why not alone |
|---|---|---|
| `GET /v3/deployments/{id}/events?follow=1` | newline-delimited JSON log lines | covers the *build*, and can stay open after it — not a reliable "done" |
| `GET /v13/deployments/{id}` every 3 s | `readyState` | the authority on when a deploy finished |

The response of the follow stream is **ndjson, not SSE** — it is read with `fetch` + a byte reader, split on `\n`, with ANSI escapes stripped. `vercelStream()` is separate from `vercelRaw()` precisely so it does not inherit the 30 s request timeout that would kill it mid-build.

SSE events we emit: `deploy_created`, `state`, `log`, `env_warning`, `ping`, then one terminal `ready` / `error` / `canceled`, then `[DONE]`.

### A deploy never depends on who is watching

- Log lines are flushed to `VercelDeployment.logTail` every ~2 s (capped at 32 KB, trimmed from the front), so a browser refresh **replays** what happened and then keeps streaming.
- When the browser goes away, the log reader stops but `finishDeploymentDetached()` keeps polling until Vercel reports a terminal state, so the DB — and the header dot — learn the outcome anyway. Same spirit as `pushAfterAiTurn()` being deliberately un-awaited.
- After a server restart, `getStatus()` re-arms a watcher for any row still in flight, so nothing spins forever.
- A detached poller that keeps failing backs off exponentially, and after `MAX_DETACHED_FAILURES` attempts marks the row `ERROR` and stops. Without that, `getStatus()` re-arming a watcher every 2 s would turn a token Vercel refuses into a request loop, and the header would spin forever.
- `recordTerminal()` is idempotent and only the link's *latest* deploy may move its status, so a stream and a detached poller racing on one deploy is harmless and a slow older deploy can't overwrite a newer one.

## No auto-deploy

Unlike `GithubRepoLink.autoPush`, **nothing here deploys on an AI turn.** There is no hook in `CodeSession.complete()` and no cron. A git-linked project redeploys because *Vercel* watches the repo, not because we call it. Deploys only happen from the Publish dialog or the dropdown's Redeploy.

## Streaming routes are POSTs

`deploy`, `redeploy` and `logs` are POSTs read with `fetch` + `getReader()`, not `EventSource` GETs — `EventSource` cannot send an `Authorization` header. Two consequences worth knowing:

- The client **must** send `Accept: text/event-stream`, or `index.ts`'s `compression()` filter buffers the log output.
- Client disconnect is detected with `res.on("close")`, not `req.on("close")`: for a POST, Node fires the latter as soon as the request body has been read.

Everything that can fail with a code the UI branches on happens in `startDeploy()`, **before** the SSE headers go out, so those failures arrive as the normal `{ status, data: { code, … }, message }` envelope. After the headers, failures are `{ type: "error" }` events.

## Data model (`schema.prisma`)

- **`VercelConnection`**: one per user. `teamId` non-null means a Team install. `isActive` is cleared (not deleted) when Vercel revokes access.
- **`VercelProjectLink`**: one per `CodeProject`. Holds the Vercel project id and the build settings last used, so Redeploy and the dropdown need no extra API call. The hot row — the header polls it every 2 s.
- **`VercelDeployment`**: one row per attempt, with its own `readyState`, `logTail` and error. Separate from the link because the log stream must be re-attachable by a stable id, because the duplicate-deploy guard is a one-query lookup over non-terminal rows, and because per-attempt errors must survive the next attempt.

## Env vars are write-through

Values are sent to Vercel and **never stored on our side** — no second encrypted column, no second source of truth. The visible consequence: the dialog can list existing *keys* but cannot pre-fill their values on a redeploy.

## Disconnecting

- **Unpublish a project** (`DELETE /projects/:id/link`) removes only `VercelProjectLink` (its deployment history cascades). The Vercel project and the **live site** are untouched.
- **Disconnect the account** (`DELETE /connection`) deletes `VercelConnection` and best-effort calls `DELETE /v1/integrations/configuration/{id}` so the install does not linger in the user's dashboard. If that call fails the local disconnect still happens.
- `CodeFile`, `CodeProjectVersion` and every deployed site always survive. Reconnecting into a *different* Vercel scope drops the old links, because those project ids are invisible to the new token.

## Known gaps

- **No webhook**, by choice rather than necessity. Deployment state is polled (`GET /v13/deployments/{id}`), and opening the header dropdown reconciles against `GET /v6/deployments` — so a deploy Vercel started from a git push shows up when someone looks, not the instant it happens.

  Adding one is straightforward if that latency matters: `req.rawBody` is already populated globally by the `express.json({ verify })` hook in `src/index.ts`, which is exactly what `github.webhook.ts` verifies its HMAC against. A Vercel webhook would subscribe to `deployment.succeeded` / `.error` / `.canceled` and `integration-configuration.removed`, verify `x-vercel-signature` the same way, and need a **publicly reachable URL — a tunnel, since webhooks are server-to-server and localhost is unreachable from Vercel.** That is the only part of this module that would need one; everything else is either outbound or a browser redirect.
- **No branch list**: the GitHub module has no branches endpoint, so the branch is a free-text field.
- **`node` / `python` projects can't be published.** Vercel wants serverless functions, and reshaping a generated Express app into `api/` handlers is a separate feature. A project that ships its own `vercel.json` is allowed through — that is the escape hatch for an advanced user.
- **Preview deployments** are out of scope: everything targets production.
- Vercel's error codes and framework presets are not contractually stable. The framework allowlist is in `vercel.types.ts` (adding one is a one-line change) and the error wording lives only in `isGitIntegrationMissing()`.

## Checking the detector

`vercel.detect.ts` is pure — no network, no Prisma. The repo has no test runner, so it has a runnable self-check in the same style as `code-workspace.parser.check.ts`:

```
npx tsx src/modules/vercel/vercel.detect.check.ts
```
