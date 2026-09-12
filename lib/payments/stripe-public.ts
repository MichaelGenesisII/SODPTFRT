/** Client-safe Stripe publishable key check (no secret). */
export function stripeConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim());
}
