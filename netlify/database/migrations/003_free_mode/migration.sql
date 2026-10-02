-- Modo gratuito: pedido de R$ 0 libera o mapa; consentimentos e sinal de interesse no diagnóstico.
alter table orders drop constraint if exists orders_amount_cents_check;
alter table orders add constraint orders_amount_cents_check check (amount_cents >= 0);
alter table orders add column if not exists contact_consent boolean not null default false;
alter table orders add column if not exists public_name_ok boolean not null default false;
alter table orders add column if not exists diagnostic_interest_at timestamptz;
