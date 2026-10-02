-- Índices para o painel filtrar por período sem varrer as tabelas inteiras.
create index if not exists events_ts_idx on events (ts);
create index if not exists quiz_sessions_created_idx on quiz_sessions (created_at);
create index if not exists results_created_idx on results (created_at);
create index if not exists results_session_idx on results (session_id);
create index if not exists orders_created_idx on orders (created_at);
create index if not exists orders_paid_idx on orders (paid_at);
create index if not exists orders_session_idx on orders (session_id);
create index if not exists entitlements_created_idx on entitlements (created_at);
create index if not exists progress_entitlement_idx on progress (entitlement_id) where checked;
