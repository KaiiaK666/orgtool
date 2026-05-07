# Organization Tool Commercial Launch

This app is wired for a free plan plus a $15/month Pro plan through Stripe Billing.

## What is already built

- In-app Billing page with Free and Pro plan cards.
- Stripe Checkout endpoint for new Pro subscriptions.
- Stripe Customer Portal endpoint so customers can update cards, see invoices, and cancel.
- Stripe webhook endpoint to update the app billing state after payment, cancellation, or failed payment.
- Optional API-side free plan limits.

## Official Stripe references

- Stripe Checkout subscriptions: https://docs.stripe.com/payments/checkout/build-subscriptions
- Stripe webhook signature verification: https://docs.stripe.com/webhooks/signature
- Stripe customer portal: https://docs.stripe.com/customer-management

## Stripe setup

1. Create or log into your Stripe account.
2. Go to Products and create a product named `Organization Tool Pro`.
3. Add a recurring monthly price for `$15.00 USD`.
4. Copy the Stripe Price ID. It starts with `price_`.
5. In Developers > API keys, copy your secret key. Use test mode first, then live mode when ready.
6. In Developers > Webhooks, add this endpoint:

```text
https://dealership-tool-api.onrender.com/orgtool/api/billing/webhook
```

7. Subscribe the webhook to these events:

```text
checkout.session.completed
customer.subscription.updated
customer.subscription.deleted
invoice.payment_failed
invoice.payment_succeeded
```

8. Copy the webhook signing secret. It starts with `whsec_`.

## Render API environment variables

Set these on the `dealership-tool-api` service in Render:

```text
STRIPE_SECRET_KEY=sk_test_or_live_key_here
STRIPE_WEBHOOK_SECRET=whsec_here
STRIPE_ORGTOOL_PRICE_ID=price_here
ORGTOOL_PUBLIC_URL=https://organize.bertogden123.com
ORGTOOL_ENFORCE_BILLING_LIMITS=false
```

Keep `ORGTOOL_ENFORCE_BILLING_LIMITS=false` while testing so you do not lock yourself out of existing boards. Set it to `true` when you are ready to enforce the free plan.

## Free vs Pro

Free plan limits:

```text
1 project
3 task groups
25 tasks
```

Pro plan:

```text
$15/month
Unlimited projects
Unlimited task groups
Unlimited tasks
AI copilot workspace actions
Screenshot notes
Installable mobile app
```

## Testing payments

Use Stripe test mode first.

```text
Card number: 4242 4242 4242 4242
Any future expiration date
Any CVC
Any ZIP
```

After payment, Stripe redirects back to the app and sends the webhook. The Billing page should change from Free to Pro after the webhook arrives.

## Going live

1. Switch Stripe from test mode to live mode.
2. Replace Render env vars with live Stripe keys and live Price ID.
3. Make sure the webhook endpoint exists in live mode too.
4. Set `ORGTOOL_PUBLIC_URL` to your real customer-facing subdomain.
5. Run one real $15 payment with your own card, then refund it in Stripe if needed.
6. Turn on `ORGTOOL_ENFORCE_BILLING_LIMITS=true` only after live payment/webhook flow is verified.
