# EcoPack store: Netlify setup

This folder is the EcoPack website plus a small server function that sends order
confirmations by email (Resend) and SMS (BulkSMS).

```
ecopack-site/
├── index.html                                  the website
├── netlify.toml                                tells Netlify where things are
└── netlify/functions/order-confirmation.mjs    sends the email and SMS
```

> **Important:** drag-and-drop deploys only upload the website, not the function.
> Use the Netlify CLI (below) or connect a GitHub repo, or emails and SMS won't send.

## 1. Get your email key (Resend)

1. Sign up at resend.com (free plan: 3,000 emails a month).
2. Go to **API Keys** and create a key. Copy it (starts with `re_`).
3. Until you verify a domain, Resend only delivers to the email address you signed up with,
   so test checkout with that address first.
4. To email any customer: **Domains → Add domain** (e.g. `ecopack.co.za`), add the DNS
   records it shows at your domain registrar, and wait for it to verify.

## 2. Get your SMS keys (BulkSMS), optional

1. Sign up at bulksms.com and buy a small bundle of credits for South Africa.
2. Go to **Settings → API Tokens**, create a token and copy the **Token ID** and **Token Secret**.

Skip this step if you only want email. The site will say SMS isn't switched on.

## 3. Deploy with the Netlify CLI

You need Node.js installed (nodejs.org, LTS version). In a terminal:

```bash
cd path/to/ecopack-site
npx netlify-cli login            # opens your browser to sign in
npx netlify-cli deploy --prod    # choose "Create & configure a new project" or link your existing site
```

Choose `.` as the publish directory if asked. The output prints your live address.

## 4. Add the keys to Netlify

In Netlify: **Site configuration → Environment variables → Add a variable**.

| Key | Value | Needed for |
|---|---|---|
| `RESEND_API_KEY` | your `re_...` key | email |
| `ORDER_FROM_EMAIL` | `EcoPack <orders@ecopack.co.za>` (after verifying the domain) | email, optional |
| `ORDER_REPLY_TO` | `hello@ecopack.co.za`, where customer replies go | email, optional |
| `STORE_URL` | `https://ecopack.netlify.app` | link button in the email, optional |
| `BULKSMS_TOKEN_ID` | your token ID | SMS |
| `BULKSMS_TOKEN_SECRET` | your token secret | SMS |

Then deploy again (`npx netlify-cli deploy --prod`) so the function picks up the keys.

## 5. Test it

Open your site, add a bag, check out with your own email and mobile number, and pay with
test card `4242 4242 4242 4242`. The confirmation screen says whether the email and SMS sent.
If something fails, look in Netlify under **Logs → Functions → order-confirmation**.

## Good to know

- Payments are still the test-mode MockPay, so every email and SMS is marked as a test order.
  Remove `test:true` in `index.html` once real payments are connected.
- The function recalculates prices on the server, so an edited page can't change the totals in
  the confirmation. If you change prices in `index.html`, change them in the function too.
- It accepts up to 5 confirmations per visitor every 10 minutes, to stop people using it to spam.
- With real payments, send confirmations from the payment provider's "payment succeeded"
  notification (webhook), not from the browser, so only paid orders get a confirmation.
