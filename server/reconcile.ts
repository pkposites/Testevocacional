// Aplicação do estado financeiro do provedor ao pedido. Idempotente e monotônica:
// - evento repetido não duplica acesso, e-mail ou Purchase;
// - "pending" antigo não rebaixa "paid"; aprovação antiga não desfaz reembolso;
// - valor/moeda/conta/referência divergentes bloqueiam a liberação automática.
import type { AppConfig } from './config';
import { one, type Db } from './db';
import type { NormalizedStatus, ProviderPaymentState } from './payments/types';

const RANK: Record<NormalizedStatus, number> = {
  pending: 0, expired: 1, cancelled: 1, rejected: 1, paid: 2, refunded: 3, disputed: 3,
};

export function mergeStatus(current: NormalizedStatus | undefined, incoming: NormalizedStatus): NormalizedStatus {
  if (!current) return incoming;
  return RANK[incoming] >= RANK[current] ? incoming : current;
}

export type ApplyResult = {
  code: 'released' | 'already_paid' | 'pending' | 'closed' | 'revoked' | 'review' | 'duplicate' | 'orphan' | 'unchanged';
  orderId?: string;
  released: boolean;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function applyProviderState(db: Db, cfg: AppConfig, provider: string, st: ProviderPaymentState): Promise<ApplyResult> {
  return db.tx(async (t) => {
    let pay = await one(t, 'select * from payments where provider = $1 and provider_resource_id = $2 for update', [provider, st.resourceId]);

    // Pedido: pelo vínculo já salvo; senão pela referência externa (id interno ou public_ref).
    let order: any;
    if (pay?.order_id) {
      order = await one(t, 'select * from orders where id = $1 for update', [pay.order_id]);
    } else if (st.externalReference) {
      const ref = st.externalReference;
      order = UUID_RE.test(ref)
        ? await one(t, 'select * from orders where id = $1 for update', [ref])
        : await one(t, 'select * from orders where public_ref = $1 for update', [ref]);
    }

    if (!order) {
      // Pagamento sem pedido correspondente: guardar e alertar. Nunca liberar por e-mail.
      await t.query(
        `insert into payments (provider, provider_resource_id, provider_payment_id, normalized_status, raw_status, verified_amount_cents, currency, flag, verified_at)
         values ($1,$2,$3,$4,$5,$6,$7,'orphan',now())
         on conflict (provider, provider_resource_id) do update set normalized_status = excluded.normalized_status, raw_status = excluded.raw_status, updated_at = now()`,
        [provider, st.resourceId, st.paymentId ?? null, st.status, st.rawStatus, st.amountCents ?? null, st.currency ?? null],
      );
      return { code: 'orphan', released: false };
    }

    const problems: string[] = [];
    if (pay?.order_id && st.externalReference && st.externalReference !== order.id && st.externalReference !== order.public_ref) {
      problems.push('reference_mismatch');
    }
    if (st.amountCents !== order.amount_cents) problems.push('amount_mismatch');
    if (st.currency && st.currency.toUpperCase() !== order.currency) problems.push('currency_mismatch');
    if (cfg.mp.expectedUserId && provider === 'mercadopago' && st.collectorId && st.collectorId !== cfg.mp.expectedUserId) {
      problems.push('account_mismatch');
    }

    const newStatus = mergeStatus(pay?.normalized_status, st.status);
    const flag = problems.length ? problems.join(',') : pay?.flag && pay.flag !== 'orphan' ? pay.flag : null;

    if (!pay) {
      pay = await one(
        t,
        `insert into payments (order_id, provider, provider_resource_id, provider_payment_id, normalized_status, raw_status, verified_amount_cents, currency, flag, verified_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) returning *`,
        [order.id, provider, st.resourceId, st.paymentId ?? null, newStatus, st.rawStatus, st.amountCents ?? null, st.currency ?? null, flag],
      );
    } else {
      await t.query(
        `update payments set order_id = coalesce(order_id, $2), provider_payment_id = coalesce($3, provider_payment_id), normalized_status = $4, raw_status = $5,
           verified_amount_cents = $6, currency = $7, flag = $8, verified_at = now(), updated_at = now() where id = $1`,
        [pay.id, order.id, st.paymentId ?? null, newStatus, st.rawStatus, st.amountCents ?? null, st.currency ?? null, flag],
      );
    }

    if (newStatus === 'paid') {
      if (problems.length) return { code: 'review', orderId: order.id, released: false };
      const otherPaid = await one(
        t,
        `select id from payments where order_id = $1 and id <> $2 and normalized_status in ('paid','refunded','disputed') and coalesce(flag,'') not like '%mismatch%'`,
        [order.id, pay!.id],
      );
      if (otherPaid) {
        await t.query(`update payments set flag = 'duplicate', updated_at = now() where id = $1`, [pay!.id]);
        return { code: 'duplicate', orderId: order.id, released: false };
      }
      if (order.status === 'paid') return { code: 'already_paid', orderId: order.id, released: false };
      if (order.status === 'refunded' || order.status === 'disputed') return { code: 'unchanged', orderId: order.id, released: false };

      await t.query(`update orders set status = 'paid', paid_at = now(), updated_at = now() where id = $1`, [order.id]);
      await t.query(
        `insert into entitlements (order_id, result_id, buyer_email, state) values ($1,$2,$3,'active') on conflict (order_id) do nothing`,
        [order.id, order.result_id, order.buyer_email],
      );
      await t.query(
        `insert into email_outbox (order_id, kind, to_email) values ($1,'purchase',$2) on conflict do nothing`,
        [order.id, order.buyer_email],
      );
      await t.query(
        `insert into events (event_id, session_id, order_id, name, attribution) values ($1,$2,$3,'Purchase',$4::jsonb) on conflict (event_id) do nothing`,
        [`purchase_${order.id}`, order.session_id, order.id, JSON.stringify(order.attribution ?? {})],
      );
      return { code: 'released', orderId: order.id, released: true };
    }

    if (newStatus === 'refunded' || newStatus === 'disputed') {
      // Revoga somente se este pagamento é o que liberou o pedido.
      if (order.status === 'paid' || order.status === newStatus || order.status === 'refunded' || order.status === 'disputed') {
        const liberating = await one(
          t,
          `select id from payments where order_id = $1 and coalesce(flag,'') = '' and normalized_status in ('paid','refunded','disputed') order by created_at asc limit 1`,
          [order.id],
        );
        if (!liberating || liberating.id === pay!.id) {
          await t.query(`update orders set status = $2, updated_at = now() where id = $1`, [order.id, newStatus]);
          await t.query(`update entitlements set state = 'revoked', revoked_at = coalesce(revoked_at, now()) where order_id = $1`, [order.id]);
          return { code: 'revoked', orderId: order.id, released: false };
        }
      }
      return { code: 'unchanged', orderId: order.id, released: false };
    }

    if (newStatus === 'expired' || newStatus === 'cancelled' || newStatus === 'rejected') {
      if (order.status === 'pending' || order.status === 'created') {
        const stillOpen = await one(
          t,
          `select id from payments where order_id = $1 and id <> $2 and normalized_status = 'pending'`,
          [order.id, pay!.id],
        );
        if (!stillOpen) {
          await t.query(`update orders set status = $2, updated_at = now() where id = $1`, [order.id, newStatus === 'expired' ? 'expired' : 'cancelled']);
        }
      }
      return { code: 'closed', orderId: order.id, released: false };
    }

    if (order.status === 'created') {
      await t.query(`update orders set status = 'pending', updated_at = now() where id = $1`, [order.id]);
    }
    return { code: 'pending', orderId: order.id, released: false };
  });
}
