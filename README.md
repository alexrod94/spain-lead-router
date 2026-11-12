# Spain Lead Router

Sends every sellable Spain Visa Eligibility Check lead to up to 3 relocation firms, in rotation, by email, and keeps track of who got what and who owes what.

## What it does

1. **Pinball → app.** A Pinball automation posts every finished visa check to `/api/pinball/lead`.
2. **Filter.** A lead is sold only if the person ticked consent, got the Digital Nomad, Non-Lucrative or Work permit result, and plans to move within 12 months. Everything else is stored for your stats but not sent.
3. **Rotation.** Up to 3 active firms get each lead. The firm that has waited longest goes first; firms at their monthly cap are skipped.
4. **Email to firms**, in Spanish, with the lead's details and a "report fake details" link valid for 7 days.
5. **Firm sign-up** at `/unete`. You approve firms in the dashboard; they get a welcome email.
6. **Dashboard** at `/admin`: this month's numbers, leads, firms (approve, pause, price, monthly cap), billing per firm and month, disputes, CSV export.
7. **Statements.** At 09:00 UTC on the 1st, each firm gets its statement for the previous month and you get a summary. You then invoice.

Business rules (price, max firms, dispute window, which routes and timelines are sold) live in `lib/config.ts`.

## Set it up (about 20 minutes)

### 1. Put the code on GitHub
Create a private repository and push this folder to it.

### 2. Vercel
1. Go to vercel.com → Add New → Project → import the repository. Don't deploy yet if it asks for settings; you can add them after.
2. In the project, open **Storage → Create Database → Neon (Postgres)** and connect it to the project. This fills in `DATABASE_URL` for you.

### 3. Resend (sends the emails)
1. Sign up at resend.com → **Domains → Add domain** → `hispanicnomad.com`.
2. Add the DNS records it shows at your domain provider and wait until it says Verified.
3. **API Keys → Create** and copy the key.

### 4. Environment variables
In Vercel → Project → Settings → Environment Variables, add:

| Name | Value |
|---|---|
| `RESEND_API_KEY` | the key from Resend |
| `EMAIL_FROM` | `Hispanic Nomad Leads <leads@hispanicnomad.com>` |
| `ADMIN_EMAIL` | `contact@hispanicnomad.com` |
| `ADMIN_PASSWORD` | a password you choose for /admin |
| `AUTH_SECRET` | (given to you separately) |
| `PINBALL_WEBHOOK_SECRET` | (given to you separately) |
| `CRON_SECRET` | (given to you separately) |
| `APP_URL` | your Vercel address, e.g. `https://spain-leads.vercel.app` |

Then **Deployments → Redeploy** so the app picks them up. The database tables are created automatically on the first request.

### 5. Check it
1. Open `APP_URL/admin`, sign in, press **Send me a sample lead email**. It should arrive at `ADMIN_EMAIL`.
2. Open `APP_URL/unete` and sign up a test firm with your own email. Approve it in **Firms**.

### 6. Connect Pinball
Send the `APP_URL` to Claude to create the Pinball automation, or build it yourself:

- Trigger: **Finishes a form or quiz** → form *Spain Visa Eligibility Check*.
- Step: **Webhook** → URL `APP_URL/api/pinball/lead`, bearer token = `PINBALL_WEBHOOK_SECRET`, retries 3, JSON payload:

```json
{
  "name": "{{contact.name}}",
  "email": "{{contact.email}}",
  "phone": "{{event.answers.phone}}",
  "citizenship": "{{event.answers.citizenship}}",
  "income_source": "{{event.answers.income_source}}",
  "monthly_income": "{{event.answers.monthly_income}}",
  "household": "{{event.answers.household}}",
  "timeline": "{{event.answers.timeline}}",
  "consent": "{{event.answers.firm_contact_consent}}",
  "outcome": "{{event.outcome_name}}"
}
```

Activate it, take the quiz once yourself with consent ticked, and check that the lead shows in **Leads** and your test firm got the email.

## Day to day
- New firm signs up → you get an email → press **Approve** in Firms.
- A lead qualifies but no firm has room → you get an email → approve a firm or raise a cap, then press **Deliver** on the lead.
- A firm reports fake details → you get an email → **Credit** or **Reject** in Billing.
- 1st of the month → statements go out → you invoice → press **Mark invoiced** and **Mark paid**.

## Development
```
cp .env.example .env.local   # fill in values
npm install
npm test                     # routing rules
npm run dev
```
