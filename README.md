# CSDSA Learning Academy — Vercel + Neon

This package changes the backend database adapter from Supabase to Neon PostgreSQL and converts the Netlify function into a Vercel Node.js function. The public frontend continues to send requests to `/api`.

## 1. Create Neon database
1. Create a project at https://console.neon.tech/.
2. In the Neon SQL Editor, run the complete contents of `db/schema.sql` once.
3. In the Neon Connect dialog, copy the **pooled** PostgreSQL connection string. Keep its password private.

## 2. Deploy to Vercel
1. Put the contents of this folder in a GitHub repository.
2. Import that repository at https://vercel.com/new.
3. Use the project root as the Root Directory. Framework preset: Other. Build command can be left blank; Output Directory is `public` (also set in `vercel.json`).
4. In Project Settings → Environment Variables, add the variables in `.env.example` for Production, Preview and Development as appropriate. `DATABASE_URL` and `SESSION_SECRET` are required. Set `SESSION_SECRET` to a unique random string at least 40 characters long. Never add private keys to `public/` or frontend code.
5. Deploy or redeploy after setting environment variables.
6. Visit `https://YOUR-DEPLOYMENT.vercel.app/api/health`. It should return `ok: true` and an empty `missingConfiguration` list. This checks configuration only; it does not prove every database operation works.

## 3. Make the first administrator
The simplest way: in Vercel Environment Variables add ADMIN_EMAILS with the email you registered (comma-separate several), then redeploy. Sign out and back in. The SQL below is an alternative.

1. Register an account on the deployed site.
2. In Neon SQL Editor, run this query with the email you registered, replacing the placeholder:

```sql
UPDATE users SET data = jsonb_set(data, '{admin}', 'true'::jsonb)
WHERE data->>'email' = 'your@email.example';
```

3. Sign out and sign back in, then check that the administrator payment approvals view appears.

## 4. Email
Set `RESEND_API_KEY`, `CERT_EMAIL`, `MAIL_FROM` and `SITE_URL`. Resend generally requires a verified sender domain for production sending. Email failures do not mean payment was verified.

## 5. Important payment limitation
`PAYSHAP_ID` is only displayed as payment instructions. A PayShap ID or uploaded proof does **not** give this application a bank transaction feed. This package does not claim to automatically verify PayShap transactions. Do not enable automatic approval until a bank or approved payment provider supplies a documented API/webhook and credentials, and the server verifies transaction status, exact amount, recipient, reference, and duplicate use. Until then, keep payment decisions manual and do not trust receipt images as confirmation of funds received.

## 6. Security and testing
- Test registration, duplicate email, login, logout/session expiry, employee creation, payment request, proof upload, assessment access, admin-only routes, and certificate verification in a test account before production use.
- Vercel Function Logs show server-side errors; do not paste database URLs or secrets into support requests.
- The application stores account and payment data in JSONB records. Back up the Neon database and review privacy, retention and access controls before collecting real learner ID/passport information.
- The original app has not been fully security-audited. A working deployment is not a guarantee that every business rule or security control is production-ready.
