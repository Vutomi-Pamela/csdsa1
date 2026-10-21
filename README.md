# CSDSA Learning Academy (Vercel + Neon)

public/index.html  the learning site
public/admin.html  the administration page (open /admin.html on your live address)
api/index.js       the server
neon/schema.sql    the database tables

## 1. Neon (database)
1. neon.tech > sign up > Create project (any name, choose the region closest to South Africa that is offered).
2. Open the project > SQL Editor > paste everything in neon/schema.sql > Run.
3. Dashboard > Connect: copy the connection string (it starts with postgresql://). This is your DATABASE_URL.

## 2. Resend (certificate email)
1. resend.com > sign up with vutomiringana@gmail.com > API Keys > Create > copy the key.
2. Until you verify your own domain in Resend, it can only send to the email you signed up with.

## 3. GitHub
Create a private repository and upload everything in this folder, keeping the folders. Do not upload a .env file.

## 4. Vercel
1. vercel.com > Add New > Project > import the repository.
2. Framework Preset: Other. Leave build and output settings alone (vercel.json sets them).
3. Environment Variables, add all of these:
   DATABASE_URL        the Neon string
   SESSION_SECRET      any random 40+ characters
   ADMIN_EMAILS        the email you will use as administrator
   RESEND_API_KEY      the Resend key
   CERT_EMAIL          vutomiringana@gmail.com
   PAYSHAP_ID          0815766197
   MEMBER_VIDEOS       optional, for the paid member videos: Title|YouTube or Vimeo link, separated by commas
4. Deploy. If you add or change a variable later, redeploy once.

## If login says "Failed to fetch" or "Could not reach"
1. Open your-address/api in the browser. It should show {"ok":true,"database":"ready",...}. If database says tables missing, run neon/schema.sql. If it says cannot connect, check DATABASE_URL. If sessionSecret is false, add SESSION_SECRET and redeploy.
2. Vercel > Project > Settings > Deployment Protection: set Vercel Authentication to Disabled (it asks visitors to sign in to Vercel), then redeploy.
3. Use the production address from the Domains tab, and open the site on that https address, not a downloaded file.

## 5. First use
1. Open your-address/admin.html (also linked on the login page) and choose Create administrator account, using the email in ADMIN_EMAILS. No PIN is needed. Do this straight away.
2. Sign in there. You will see payments, proof viewing, certificates, employers and individuals.

## 6. Test
1. Register a business, add an employee with a valid ID or passport number.
2. Sign in as the employee, pay the course, upload proof.
3. In admin.html, view the proof and approve it.
4. The employee pays and passes the assessment: the certificate email goes to CERT_EMAIL.
