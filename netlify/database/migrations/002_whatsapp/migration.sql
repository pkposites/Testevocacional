-- Contato do comprador passa de e-mail para WhatsApp (E.164 sem "+").
alter table orders rename column buyer_email to buyer_phone;
drop index if exists orders_email_idx;
create index if not exists orders_phone_idx on orders (buyer_phone);

alter table entitlements rename column buyer_email to buyer_phone;
drop index if exists entitlements_email_idx;
create index if not exists entitlements_phone_idx on entitlements (buyer_phone);

alter table access_tokens rename column buyer_email to buyer_phone;
alter table access_sessions rename column buyer_email to buyer_phone;

alter table email_outbox rename to message_outbox;
alter table message_outbox rename column to_email to to_phone;
alter index if exists email_outbox_purchase_once rename to message_outbox_purchase_once;
