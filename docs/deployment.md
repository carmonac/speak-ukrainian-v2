# Deployment

Everything is deployed to one Cloudflare account, from a developer machine.
Nothing is deployed by GitHub Actions; the workflow there only verifies.

| What                    | Where it runs                               | Address                              |
| ----------------------- | ------------------------------------------- | ------------------------------------ |
| Gateway + API container | Worker `speakukrainian-gateway` + Container | `https://speakukrainian.org`         |
| Control panel           | Worker `speakukrainian-admin` (assets)      | `https://admin.speakukrainian.org`   |
| Classroom               | Worker `speakukrainian-student` (assets)    | `https://student.speakukrainian.org` |

`www.speakukrainian.org` redirects to the apex.

## What you need

- Membership of the Cloudflare account that holds the `speakukrainian.org`
  zone, on the **Workers Paid** plan (required by Containers, and by Email
  Sending to send to any address).
- `pnpm exec wrangler login`, once per machine.
- **Docker running**: the API image is built on your machine and pushed by
  `wrangler deploy`.

## Cloudflare resources

These exist already. The ids that the code needs are in
`apps/gateway/wrangler.jsonc`.

| Resource      | Name                 | Notes                                                                                            |
| ------------- | -------------------- | ------------------------------------------------------------------------------------------------ |
| D1 database   | `speakukrainian`     | Western Europe. Bound to the gateway as `DB`.                                                    |
| R2 bucket     | `speakukrainian-h5p` | Private: no public URL, no custom domain, no access keys. Bound as `FILES`.                      |
| Email Sending | `speakukrainian.org` | Onboarded in the dashboard (Email Service → Email Sending). Bound as `EMAIL`; quota 200 a day.   |
| DNS           | zone records         | MX, SPF and DKIM on `cf-bounce`, `_dmarc` with `p=reject`, and a proxied `www` for the redirect. |
| Redirect rule | `www` → apex         | Zone ruleset, phase `http_request_dynamic_redirect`.                                             |

The records for the apex, `admin` and `student` are created by the Workers'
custom domains on their first deploy.

To recreate them from scratch in another account: `wrangler d1 create`,
`wrangler r2 bucket create`, onboard the domain for Email Sending in the
dashboard, add the `www` record and redirect rule, and put the new database
id and bucket name in `apps/gateway/wrangler.jsonc`.

## Settings and secrets

Plain settings are `vars` in `apps/gateway/wrangler.jsonc`. The gateway hands
every one of them, and every secret, to the API container as its environment.

| Setting                                               | Kind   | Value                                                                   |
| ----------------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| `PUBLIC_SITE_URL`, `ADMIN_APP_URL`, `STUDENT_APP_URL` | var    | The three public addresses                                              |
| `CORS_ORIGINS`                                        | var    | The admin and student origins                                           |
| `H5P_BASE_URL`                                        | var    | `https://speakukrainian.org/api/h5p`                                    |
| `EMAIL_DELIVERY`, `EMAIL_FROM`                        | var    | `send`, and the sender on the onboarded domain                          |
| `AUTH_SECRET`                                         | secret | Signs session tokens. `openssl rand -base64 48`                         |
| `H5P_URL_TOKEN_SECRET`                                | secret | Signs exercise URLs and salts visitor hashes. `openssl rand -base64 48` |
| `CRON_SECRET`                                         | secret | Lets the daily trigger call the API. `openssl rand -hex 24`             |
| `ADMIN_EMAIL`                                         | secret | The administrator's e-mail address                                      |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`          | secret | Only once payments are live (see Stripe below)                          |

The first deploy creates the first four for you (see Deploying). To set or
replace one by hand, use Wrangler; they are never in the repository:

```bash
cd apps/gateway
pnpm exec wrangler secret put AUTH_SECRET
pnpm exec wrangler secret put H5P_URL_TOKEN_SECRET
pnpm exec wrangler secret put CRON_SECRET
pnpm exec wrangler secret put ADMIN_EMAIL
```

Changing `AUTH_SECRET` signs everybody out. Changing `H5P_URL_TOKEN_SECRET`
invalidates the exercise links already handed out (a page reload fixes it). A
changed secret reaches the API the next time its container starts.

The two Angular apps have no secrets. Their only setting is where the API is,
in `apps/<app>/config/production/config.json`.

## Deploying

One command, from the repository root:

```bash
pnpm deploy:prod
```

It is `scripts/deploy.ts`. In order, it:

1. **Checks that it can finish**: wrangler is logged in, Docker is running,
   and the gateway has its secrets. If one of them is not true it stops
   before changing anything and says what to do.
2. Runs `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build`.
3. Applies pending D1 migrations to the production database.
4. Deploys the gateway, building and pushing the API image.
5. Builds and deploys the control panel, then the classroom.
6. Waits for `https://speakukrainian.org/api/health` and prints the addresses.

It stops at the first step that fails and names it; nothing after that step
runs.

| Command                                 | Does                                              |
| --------------------------------------- | ------------------------------------------------- |
| `pnpm deploy:prod`                      | Everything                                        |
| `pnpm deploy:prod gateway`              | One target: `db`, `gateway`, `admin` or `student` |
| `pnpm deploy:prod admin student`        | Several                                           |
| `pnpm deploy:prod --dry-run`            | The checks and dry-run deploys; changes nothing   |
| `pnpm deploy:prod --skip-checks`        | Without lint, typecheck, test and build           |
| `pnpm deploy:prod --admin-email=<addr>` | First deploy only: who the administrator is       |

(`pnpm deploy`, without `:prod`, is an unrelated built-in pnpm command.)

**The first deploy** needs the administrator's address, because the gateway
has no secrets yet:

```bash
pnpm deploy:prod --admin-email=<address>
```

That run generates `AUTH_SECRET`, `H5P_URL_TOKEN_SECRET` and `CRON_SECRET`,
and stores them with `ADMIN_EMAIL` as Worker secrets. They are never printed
or written to the repository; later deploys find them and leave them alone.
To replace one by hand, use `wrangler secret put` as shown above.

Order matters when a release changes the database, which is why the script
always goes migrations, gateway, apps. Write migrations so the previous API
version still works with the new schema (add columns, do not rename or drop in
the same release), because the old container keeps serving until the new one
starts.

The first deploy of the gateway takes several minutes before the container
answers. On later ones the running container is replaced on the first request
after the deploy: Cloudflare keeps a running container on the image it started
with, so the gateway remembers which deploy started it and, when that is not
the current one, stops it and starts the new image. That request waits a few
seconds, as after a cold start.

### First deploy: the administrator

The first time the API starts against the database it creates the
administrator for `ADMIN_EMAIL` with the password **`admin123`**.

1. Open `https://admin.speakukrainian.org` and sign in with that password.
2. The panel shows a warning on every page. Follow it to **Account** and
   choose a real password.

Do this immediately: until then anybody who knows the address can sign in.
If the password is ever lost, "Forgot your password?" on the sign-in page
e-mails a reset link.

### Stripe

1. Take the **secret key** (test key first) → `STRIPE_SECRET_KEY`.
2. **Developers → Webhooks → Add endpoint**
   - URL: `https://speakukrainian.org/api/payments/stripe/webhook`
   - Events: `checkout.session.completed`,
     `checkout.session.async_payment_succeeded`,
     `checkout.session.async_payment_failed`, `checkout.session.expired`
   - Signing secret → `STRIPE_WEBHOOK_SECRET`
3. `wrangler secret put` both in `apps/gateway`.

Production does not need the key to start. Until it is set the API boots
normally and logs a warning, paid courses cannot be bought (the checkout
answers 503 "Payments are not available yet") and free courses work. Prices are set per
course in the control panel, and so are discount coupons (Coupons in the
menu); no products or Stripe coupons need to exist in Stripe.

## Checks after a deploy

- `https://speakukrainian.org/api/health` → `{"status":"ok","database":"ok"}`
- `https://speakukrainian.org/` shows the main page
- `https://admin.speakukrainian.org` and `https://student.speakukrainian.org`
  load, and a deep link such as `/courses` reloads without a 404
- Logs: `pnpm --filter @speakukrainian/gateway exec wrangler tail`
- The daily job: Workers → `speakukrainian-gateway` → Settings → Triggers
  shows the last run of the Cron Trigger

## Rolling back

Each Worker keeps its previous versions:

```bash
pnpm --filter @speakukrainian/gateway exec wrangler rollback
```

The same works for the two apps. Database migrations are not rolled back by
this; that is why they have to stay compatible with the previous release.

## Backups

- **D1** keeps 30 days of point-in-time history (Time Travel):
  `wrangler d1 time-travel restore speakukrainian --timestamp=<ISO time>`. For
  a copy outside Cloudflare: `wrangler d1 export speakukrainian --remote --output=backup.sql`.
- **R2** is not backed up automatically. The H5P files are in the bucket, not
  in the database; copy the bucket if an independent backup is wanted.

## Enabling Google and Apple sign-in

Both are prepared and switched off. The configuration, with the links and
callback URLs, is a commented block in `apps/api/src/auth/auth.ts`.

1. **Register the application with the provider.**
   - Google: an OAuth client in the Google Cloud console, with the redirect
     URI `https://speakukrainian.org/api/auth/callback/google`.
   - Apple: a Services ID with the return URL
     `https://speakukrainian.org/api/auth/callback/apple`. Apple does not
     accept `localhost`, and its client secret is a JWT signed with the `.p8`
     key that expires after at most six months, so it has to be regenerated on
     a schedule.
2. **API.** Uncomment the `socialProviders` block, add the client id and
   secret of each provider to `AuthDependencies` and to
   `config/configuration.ts`, and for Apple add `https://appleid.apple.com` to
   `trustedOrigins`.
3. **Secrets.** `wrangler secret put GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
   `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET` in `apps/gateway`.
4. **Apps.** Add the buttons. A social sign-in is a redirect: the app sends
   the browser to the URL that `POST /api/auth/sign-in/social` returns, and
   the provider sends it back to the app. The apps do not send cookies today
   (`credentials: 'omit'` in `core/auth.service.ts`); on returning from the
   provider the app has to make one request **with** credentials to
   `GET /api/auth/get-session` and keep the token from its `set-auth-token`
   header, after which it works as it does now.

Accounts are linked by e-mail address, so someone who registered with a
password can later use Google with the same address. A new social account is
a student, like any other.

## Limits worth knowing

- **E-mail:** 200 messages a day on the account.
- **Uploads:** an H5P package can be up to 100 MB, which is also the largest
  request body the zone's plan accepts.
- **Cold start:** the API container sleeps after 30 minutes without requests;
  the next visitor waits a few seconds. The timeout and the container size are
  constants at the top of `apps/gateway/src/api-container.ts`.
