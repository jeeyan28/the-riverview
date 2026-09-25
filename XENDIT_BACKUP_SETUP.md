# Xendit backup checkout

PayMongo remains the primary online gateway. The server switches to Xendit only when PayMongo cannot create a payment intent because of a connection timeout/network error or HTTP 500/502/503/504. It does not switch after a card or wallet payment has started, for an invalid API key, or for a declined payment. The backup hosted checkout offers GCash and Maya. A reservation is confirmed only after the server retrieves the Xendit session and successful payment.

## Setup

1. Create a Xendit merchant account and complete the required business verification. Activate **GCash** and **Maya** for the account. Confirm both are available in the Xendit dashboard before going live.
2. In the Xendit dashboard, create a **test secret API key** with payment session and payment read access. Set `XENDIT_SECRET_KEY` in the backend environment. Never put this key in frontend variables or source control.
3. Set `XENDIT_RETURN_BASE_URL` to the public **HTTPS origin** of the frontend, for example `https://your-site.example`. Xendit requires HTTPS return URLs. Local testing needs an HTTPS tunnel or a staging site.
4. In Xendit's webhook settings, create a **Payment Session** webhook pointing to `https://your-api.example/api/payments/xendit/webhook`. Copy the webhook verification token into backend `XENDIT_WEBHOOK_TOKEN`. The backup stays disabled until all three variables are set.
5. Test with Xendit test credentials. Simulate a PayMongo HTTP 503 response at the payment-intent creation step. Confirm that checkout redirects to Xendit, GCash/Maya are offered, a successful test payment creates exactly one reservation, the receipt shows the correct amount, and a canceled/expired checkout creates no reservation. Repeat the test with PayMongo restored; checkout should use PayMongo.
6. Replace the test key and webhook token with live values in the deployment environment, verify the live payment channels and webhook, and run a small live payment and reconciliation check before relying on failover.

If both gateways are unavailable, checkout shows an error and does not create a reservation. A successful charge whose room slot is no longer available is flagged for manual review/refund; check both provider dashboards and the reservation list before asking the guest to pay again.

Official references: [payment sessions](https://docs.xendit.co/apidocs/create-session), [GCash](https://docs.xendit.co/docs/gcash), [Maya](https://docs.xendit.co/docs/maya), [webhook authentication](https://docs.xendit.co/docs/handling-webhooks).
