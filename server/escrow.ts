import crypto from 'node:crypto';

/**
 * Escrow = Stripe PaymentIntent with capture_method=manual.
 * authorize on BOOKED, capture on COMPLETE, cancel (or refund) on refund paths.
 * With no STRIPE_SECRET_KEY (or a non-test key) it runs a local mock with the same lifecycle.
 */

const SK = process.env.STRIPE_SECRET_KEY;
export const escrowMode: 'stripe-test' | 'mock' = SK && SK.startsWith('sk_test_') ? 'stripe-test' : 'mock';

async function stripe(path: string, params: Record<string, string>) {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${SK}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const j: any = await r.json();
  if (!r.ok) throw new Error(j?.error?.message ?? 'Stripe error');
  return j;
}

export async function authorize(cents: number, tradeId: string): Promise<string> {
  if (escrowMode === 'mock') return `pi_mock_${crypto.randomBytes(8).toString('hex')}`;
  const pi = await stripe('payment_intents', {
    amount: String(cents),
    currency: 'usd',
    capture_method: 'manual',
    confirm: 'true',
    payment_method: 'pm_card_visa',
    'automatic_payment_methods[enabled]': 'true',
    'automatic_payment_methods[allow_redirects]': 'never',
    'metadata[trade_id]': tradeId,
    description: `Passport trade ${tradeId}`,
  });
  return pi.id as string;
}

export async function capture(pi: string | null) {
  if (!pi || escrowMode === 'mock' || pi.startsWith('pi_mock_')) return;
  await stripe(`payment_intents/${pi}/capture`, {});
}

export async function cancel(pi: string | null) {
  if (!pi || escrowMode === 'mock' || pi.startsWith('pi_mock_')) return;
  await stripe(`payment_intents/${pi}/cancel`, {});
}

export async function refund(pi: string | null) {
  if (!pi || escrowMode === 'mock' || pi.startsWith('pi_mock_')) return;
  await stripe('refunds', { payment_intent: pi });
}
