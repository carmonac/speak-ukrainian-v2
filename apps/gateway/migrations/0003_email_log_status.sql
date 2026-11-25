-- Every attempt to send an e-mail is recorded, not only the ones that worked.
--
--   sent    handed to Cloudflare Email Sending
--   failed  the provider (or the bridge) refused it; `error` says why
--   logged  delivery is switched off (local development): written to the API
--           log instead
alter table email_log add column status text not null default 'sent'
  check (status in ('sent', 'failed', 'logged'));
alter table email_log add column error text;
