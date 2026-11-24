# SePay QR Sandbox setup

The application now supports the SePay Payment Gateway's **QR bank transfer**
method in Sandbox. It does not use Bank Hub and it does not credit coins from a
browser redirect.

## Server secrets

Set these values in the deployment secret store or in an untracked `.env.local`
for local development. Never put them in `NEXT_PUBLIC_*` variables or chat:

```dotenv
SEPAY_ENV=sandbox
SEPAY_MERCHANT_ID=SP-TEST-...
SEPAY_SECRET_KEY=spsk_test_...
SEPAY_IPN_SECRET=<the separate key configured in SePay's IPN settings>
SEPAY_PUBLIC_URL=https://your-public-https-domain.example
```

For a Cloudflare deployment, use `wrangler secret put SEPAY_SECRET_KEY`,
`wrangler secret put SEPAY_IPN_SECRET`, and the other server-side values rather
than committing `.env.local`. Apply the D1 migration remotely only after
reviewing the target database:

```text
npx wrangler d1 migrations apply labellab3d-production --remote
```

`SEPAY_SECRET_KEY` is the **merchant secret** under `Cổng thanh toán → Cấu
hình → Thông tin đơn vị`. `SEPAY_IPN_SECRET` is a different, self-chosen secret
configured under `Cổng thanh toán → Cấu hình → IPN` with auth type
`SECRET_KEY`.

`SEPAY_PUBLIC_URL` must be an HTTPS URL reachable by SePay. A localhost URL
cannot receive IPN. For local work, use a temporary HTTPS tunnel or a deployed
preview URL and set the IPN URL in SePay to:

```text
https://your-public-https-domain.example/api/payments/webhook/sepay
```

## Database

Apply migration `db/migrations/0005_payments.sql` to the D1 database before
testing. The migration creates the server-side order and webhook event tables.

## Test flow

1. Enable SePay **Test Mode → Quét mã QR chuyển khoản ngân hàng**.
2. Configure the IPN auth type as `SECRET_KEY` and set the same IPN secret as
   `SEPAY_IPN_SECRET`.
3. Sign in to Labellab3D and click a coin package.
4. Click **Tạo mã QR thanh toán**, then **Mở QR thanh toán**. The QR is shown on
   SePay's hosted checkout page.
5. Complete a Sandbox payment or use SePay's test simulator.
6. SePay POSTs to the webhook. Only a valid `ORDER_PAID` event with matching
   invoice, amount, currency, status and payment method credits the wallet.

The browser success URL is only a status page. It is never treated as proof of
payment. Replayed events are deduplicated and the existing wallet ledger's
idempotency key prevents double credit.

## Go-live gate

Keep `SEPAY_ENV=sandbox` until merchant approval, production bank setup,
refund/support policies, invoice/tax decisions and webhook testing are complete.
For production, create the production merchant credentials and change the
checkout/IPN configuration together; do not reuse test credentials.
