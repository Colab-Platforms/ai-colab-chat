# GitHub integration

Mirrors a `CodeProject` to a GitHub repository. **One `CodeProjectVersion` == one commit**, so the in-app version history and the repo's git history line up 1:1.

Publishing a project to a live URL is a separate module — see `../vercel/README.md`, which can deploy either from a repo linked here or straight from the `CodeFile` rows.

GitHub is a *mirror, never the source of truth*: `CodeFile` rows stay authoritative, and the whole feature is optional. A server without credentials, a user without a connection, and a project without a link all behave exactly as they did before this module existed.

## Runs with an empty `.env`

Nothing here reads env vars at module load. `isGithubConfigured()` is a cheap boolean; `getGithubConfig()` throws an `ApiError` only when *called*. So:

- the server boots normally with zero `GITHUB_*` vars,
- `GET /api/github/status` answers `{ configured: false }` and the frontend hides the header button entirely,
- `pushAfterAiTurn()` returns immediately, so AI turns are untouched,
- the webhook answers `503` instead of hashing against an undefined secret.

Filling the vars in later switches the feature on with no code change.

## Setup

1. Create a GitHub App at **Settings → Developer settings → GitHub Apps → New**.
2. Repository permissions: **Contents: Read & write**, **Metadata: Read**. To let the "Create new" tab make repositories, also grant **Repository creation** (preferred — narrow) or **Administration: Read & write** (broader: it also allows changing/deleting repo settings). Without it `POST /user/repos` answers `403 Resource not accessible by integration` and only "Select existing" works. After changing permissions, each installation must accept the update at `github.com/settings/installations/<id>`.
3. Check **"Request user authorization (OAuth) during installation"** — required, or the callback gets no `code` and creating repositories is impossible.
4. Callback URL **and** Setup URL → `GITHUB_CALLBACK_URL`.
5. Subscribe to the `installation` and `installation_repositories` events, webhook URL `…/api/github/webhook`.
6. Generate a private key, then fill `backend/.env`:

```
GITHUB_APP_ID=
GITHUB_APP_SLUG=              # the app's URL slug: github.com/apps/<slug>
GITHUB_APP_PRIVATE_KEY=       # the .pem, base64-encoded (a raw multi-line PEM does not survive .env)
GITHUB_APP_CLIENT_ID=
GITHUB_APP_CLIENT_SECRET=
GITHUB_APP_WEBHOOK_SECRET=
GITHUB_CALLBACK_URL=          # https://api.example.com/api/github/callback
FRONTEND_GITHUB_CALLBACK_URL= # https://app.example.com/github/callback
TOKEN_ENCRYPTION_KEY=         # openssl rand -hex 32
```

For local development the callback must be reachable from GitHub, so point it at an ngrok/cloudflared tunnel rather than `localhost`.

## Tokens (`github.app.ts`)

| Token | Obtained from | Lifetime | Used for |
|---|---|---|---|
| App JWT | `jwt.sign(..., RS256)` with the private key | 9 min | minting installation tokens only |
| Installation (`ghs_`) | `POST /app/installations/{id}/access_tokens` | 1 h, cached in-process, re-minted | all git data ops |
| User-to-server (`ghu_`) | `code` → `POST /login/oauth/access_token` | 8 h + refresh, or permanent | `GET /user/installations`, listing and **creating** repos |

Creating a repo on a user account is impossible with an installation token — hence the user token. Both user tokens are AES-256-GCM encrypted at rest (`utils/crypto.ts`) and never leave the server.

## Push (`github.sync.ts`)

`git/ref` → `git/trees` → `git/commits` → `git/refs`.

The tree is built **without `base_tree`**, so it is exactly the project's files and a locally deleted file disappears from GitHub too. Two consequences:

- Repos are created with `auto_init: false`, and linking a repo that already has commits forces an explicit choice (`REPO_NOT_EMPTY`): import it, or overwrite it.
- A **remote-ahead guard** refuses to push when the branch head is not the sha we last wrote (`REMOTE_AHEAD`), otherwise an edit made on github.com would be silently erased. The UI then offers Pull or Overwrite.

A repository with zero commits rejects every git-data call with `409`, so the first commit goes through the Contents API (`bootstrapEmptyRepo`) and the tree commit builds on it.

Pushes are serialised per project, and an identical tree produces no empty commit.

## Pull

`git/trees?recursive=1` → blobs, filtered through the code workspace's own `normalizeCodePath()` (rejects `..`, absolute paths, `node_modules/`, `.git/`) plus binary-extension, NUL-byte, size and file-count limits. Skipped paths are returned and reported in the UI.

Local state is never lost: `snapshotUserEditsIfDirty()` runs first, then files are replaced in a transaction, then the result is recorded as a `GITHUB` version. The v-chip menu can always get back.

## Auto-commit

`CodeSession.complete()` (`code-workspace.chat.ts`) calls `pushAfterAiTurn()` **after** the `code_done` SSE and without awaiting it — a slow or failing GitHub call must never delay or break the chat stream. Failures land on `GithubRepoLink.syncState` / `lastError`, which the header button polls.

Manual editor edits do **not** auto-commit; the Push button snapshots them as a `USER` version and commits that.

## Disconnecting

Unlinking a repo or disconnecting the account deletes only `GithubRepoLink` / `GithubConnection`. `CodeFile`, `CodeProjectVersion` and the GitHub repository itself are never touched, and old `GITHUB`-source versions stay in the history.
