-- Discount coupons: a code a student types while buying a course, taking a
-- percentage off its price between two dates (inclusive, UTC days). Codes are
-- stored upper-case by the API and compared without case.
create table coupons (
  id text primary key default (lower(printf('%s-%s-4%s-%s%s-%s', hex(randomblob(4)), hex(randomblob(2)), substr(hex(randomblob(2)), 2), substr('89ab', 1 + (abs(random()) % 4), 1), substr(hex(randomblob(2)), 2), hex(randomblob(6))))),
  code text not null collate nocase unique,
  percent_off integer not null check (percent_off between 1 and 100),
  starts_on text not null check (starts_on glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  ends_on text not null check (ends_on glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  check (ends_on >= starts_on)
) strict;

create trigger coupons_touch after update on coupons
for each row when new.updated_at = old.updated_at
begin
  update coupons set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = new.id;
end;

-- What the order was sold with, copied rather than referenced: editing or
-- deleting a coupon later must not change what a past purchase says.
-- amount_cents stays what was charged; the course price is not stored twice.
alter table orders add column coupon_code text;
alter table orders add column discount_percent integer check (discount_percent between 1 and 100);
