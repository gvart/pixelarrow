# v6 proposals

Ideas the run must not change itself, such as real-money pricing.

## A web payment provider (V6-PAY-02)

Not chosen and not dated: the web shows "coming soon" (AU-20) until the owner picks a provider. How
one would plug in without a shop change (ADR-0006 M7):

1. Add the provider to `PaymentStatus` and `Payments.pay` in `src/platform/core/payments.ts`, and
   make `src/platform/web/payments.ts` return `{ available: true, provider: '<id>' }` when it can pay.
2. The shop follows the status on its own: `packButton` (src/ui/econ/shopModel.ts) then shows the
   price button, the AU-20 card disappears, and `packLegalKey` picks the legal line for that provider
   (a new key with that provider's terms).
3. The server issues the provider's checkout from `POST /api/shop/invoice` (today it refuses anything
   but a Telegram bearer session) and credits through the existing grant logic from the provider's
   webhook; pack prices stay the catalogue's.
4. Owner decisions before any of this: the provider, its prices in local currency (real-money
   pricing must not change silently), taxes and refunds, and the Terms and Refunds pages.
