# Deployment

The production setup is one VPS running Docker Compose, plus a hosted Supabase
project. The VPS holds no state: the database, user accounts and H5P files all
live in Supabase.

```
                 ┌──────────── VPS (docker-compose.prod.yml) ───────────┐
 example.com ───▶│ caddy ──▶ api      (public site + /api)              │──▶ Supabase
 admin.example ─▶│   │ ───▶ admin    (static Angular, nginx)            │──▶ Stripe
 student.exam. ─▶│   └────▶ student  (static Angular, nginx)            │──▶ SendGrid
                 └──────────────────────────────────────────────────────┘
```

## 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the schema from your machine:
   ```bash
   supabase link --project-ref <project-ref>
   supabase db push
   ```
3. Collect, from the project settings:
   - **Project URL** → `SUPABASE_URL`
   - **Publishable / anon key** → `SUPABASE_ANON_KEY`
   - **Secret / service-role key** → `SUPABASE_SERVICE_ROLE_KEY`
   - **Database → Connection string** (session pooler or direct) → `DATABASE_URL`
   - **Storage → S3 connection**: enable it, create an access key →
     `STORAGE_S3_ACCESS_KEY_ID`, `STORAGE_S3_SECRET_ACCESS_KEY`, and the region
     → `STORAGE_S3_REGION`. The endpoint defaults to
     `<SUPABASE_URL>/storage/v1/s3`.
4. **Authentication → URL configuration:** set _Site URL_ to
   `https://student.<domain>` and add `https://student.<domain>/**` to the
   redirect URLs (used by the password-reset link).
5. **Authentication → Emails → SMTP:** configure SendGrid SMTP
   (`smtp.sendgrid.net`, user `apikey`, password = your SendGrid API key) so
   confirmation and password-reset emails come from your domain. Decide whether
   to require email confirmation on sign-up.
6. In **Storage settings**, make sure the global upload limit is at least
   100 MB (the H5P package limit).

The storage bucket (`STORAGE_BUCKET`, default `h5p`, private) is created by the
API on first start.

## 2. Stripe

1. Create an account and take the **secret key** → `STRIPE_SECRET_KEY`
   (use the test key first).
2. **Developers → Webhooks → Add endpoint**
   - URL: `https://<domain>/api/payments/stripe/webhook`
   - Events: `checkout.session.completed`,
     `checkout.session.async_payment_succeeded`,
     `checkout.session.async_payment_failed`, `checkout.session.expired`
   - Signing secret → `STRIPE_WEBHOOK_SECRET`

The API refuses to start in production without `STRIPE_SECRET_KEY`. Prices are
set per course in the control panel; no products need to exist in Stripe.

## 3. SendGrid

Create an API key with _Mail Send_ permission → `SENDGRID_API_KEY`, verify a
sender or domain, and set `EMAIL_FROM` to it, e.g.
`SpeakUkrainian <hello@example.com>`.

## 4. DNS

Create `A` (and `AAAA`) records pointing at the VPS for:

- `<domain>`
- `www.<domain>`
- `admin.<domain>`
- `student.<domain>`

Caddy obtains and renews the TLS certificates automatically once they resolve.

## 5. The server

Any Linux VPS with Docker and the Compose plugin; 2 GB of RAM is comfortable
(image builds are the heaviest moment). Open ports 80 and 443.

```bash
git clone <repository> speakukrainian && cd speakukrainian
cp .env.example .env
nano .env
```

Fill in `.env`:

| Variable                                                                         | Value                                       |
| -------------------------------------------------------------------------------- | ------------------------------------------- |
| `DOMAIN`                                                                         | Your apex domain, e.g. `speakukrainian.com` |
| `ADMIN_EMAIL`                                                                    | The administrator's email                   |
| `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` | From step 1                                 |
| `STORAGE_S3_*`                                                                   | From step 1                                 |
| `H5P_URL_TOKEN_SECRET`                                                           | `openssl rand -hex 32`                      |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`                                     | From step 2                                 |
| `SENDGRID_API_KEY`, `EMAIL_FROM`                                                 | From step 3                                 |

`PUBLIC_SITE_URL`, `STUDENT_APP_URL`, `ADMIN_APP_URL`, `CORS_ORIGINS` and
`H5P_BASE_URL` are derived from `DOMAIN` by the compose file; whatever `.env`
says for them is ignored in production.

Start it:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### First start: the admin password

```bash
docker compose -f docker-compose.prod.yml logs api | grep -A4 "ADMIN ACCOUNT CREATED"
```

The password is printed **only on the start that creates the account**. Store
it in a password manager, then sign in at `https://admin.<domain>`. To change
it later, use _Authentication → Users_ in the Supabase dashboard.

## Updating

```bash
git pull
supabase db push                      # only when there are new migrations
docker compose -f docker-compose.prod.yml up -d --build
```

## Checks

- `https://<domain>/api/health` → `{"status":"ok","database":"ok"}`
- `https://<domain>/` shows the main page
- `https://admin.<domain>` and `https://student.<domain>` load
- In Stripe, send a test `checkout.session.completed` webhook → HTTP 200

## Backups

Everything worth backing up is in Supabase: enable database backups (included
in paid plans, or schedule `supabase db dump`), and remember the H5P files are
in the Storage bucket, not in the database.
