# ProofSold website

Static site (`index.html`) + one serverless function (`api/early-access.js`). Deploys as-is to Vercel.

## What the form does
Validates the email, blocks bots (honeypot) and duplicate emails, stores each application in Upstash Redis, then emails it to the owner via Resend. If the email step fails the application is still saved.

## Setup needed before the form works (about 15 minutes)
1. **Resend** (resend.com): create an account and an API key. Verify a sending domain you own, then set `FROM_EMAIL` to an address on it. (Without a verified domain Resend only sends to your own account email.)
2. **Upstash Redis** (upstash.com, free tier): create a database and copy the REST URL and REST token.
3. **Owner email**: choose the address that should receive applications -> `OWNER_NOTIFICATION_EMAIL`.
4. **Deploy**: push this folder to GitHub, import it into Vercel, add the 5 variables from `.env.example`, deploy.
5. Submit a test application. To read stored applications: Upstash console > Data Browser > list `proofsold:applications`.

The form cannot send email when the page is opened as a plain file or on a host with no server functions.

## Before launch
Replace the contact placeholders and the Privacy Policy / Terms links in the footer.
