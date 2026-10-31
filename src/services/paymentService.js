// Demo payment gateway. Replace the bodies with Razorpay / Stripe calls for production;
// the rest of the app only depends on these two functions.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export const PAYMENT_METHODS = ["upi", "card", "netbanking", "wallet"];

export async function charge({ amount, method, reference }) {
  await wait(400);
  return { ok: true, gatewayRef: `demo_${reference}`, amount, method };
}

export async function refund({ amount, gatewayRef }) {
  await wait(150);
  return { ok: true, gatewayRef, amount };
}
