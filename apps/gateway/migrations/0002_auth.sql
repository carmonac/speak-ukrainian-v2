-- Authentication tables, owned by better-auth (apps/api/src/auth/auth.ts).
--
-- Table and column names are the library's defaults; `user` itself was created
-- in 0001. Regenerate the expected shape with `getAuthTables()` from
-- `better-auth/db` when upgrading the library or adding a plugin, and add a new
-- migration for any difference.
--
-- Dates are ISO 8601 text and booleans 0/1, which is how the library's SQLite
-- adapter writes them. Not STRICT: the library decides the encoding.

-- When the account last signed in. Written by the API when a session is
-- created; sessions themselves are deleted on sign-out and expiry.
alter table "user" add column "lastSignInAt" text;

create table session (
  id text primary key,
  "expiresAt" text not null,
  token text not null unique,
  "createdAt" text not null,
  "updatedAt" text not null,
  "ipAddress" text,
  "userAgent" text,
  "userId" text not null references "user" (id) on delete cascade,
  -- admin plugin: set while an administrator is acting as this user.
  "impersonatedBy" text
);
create index session_user on session ("userId");

-- One row per way of signing in. E-mail and password is providerId
-- 'credential', with the password hash in `password`; Google and Apple, once
-- enabled, add rows with their own providerId.
create table account (
  id text primary key,
  "accountId" text not null,
  "providerId" text not null,
  "userId" text not null references "user" (id) on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" text,
  "refreshTokenExpiresAt" text,
  scope text,
  password text,
  "createdAt" text not null,
  "updatedAt" text not null
);
create index account_user on account ("userId");

-- Short-lived tokens: password resets and e-mail verification.
create table verification (
  id text primary key,
  identifier text not null,
  value text not null,
  "expiresAt" text not null,
  "createdAt" text not null,
  "updatedAt" text not null
);
create index verification_identifier on verification (identifier);
