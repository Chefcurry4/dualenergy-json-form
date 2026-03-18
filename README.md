# dualenergy-json-form

A landing page where users submit DSSAT crop modelling parameters (crop-specific genetic coefficients, soil characteristics, and management practices) along with their contact details. On submission, the data is serialised to JSON and sent via Gmail to **massimoperfetti4@gmail.com**.

## Features

- **Personal & Field Information**: name, email, company, field name
- **Crop Genetic Coefficients**: P1, P2, P5, G2, G3, PHINT with correct DSSAT units
- **Soil Characteristics**: soil series, texture, depth, bulk density, field capacity, wilting point, organic carbon, pH, runoff curve number
- **Management Practices**: planting date, plant density, row spacing, initial soil water, nitrogen fertilizer, fertilizer date, irrigation amount, irrigation date
- Client-side **and** server-side validation of all inputs
- Data submitted as structured **JSON** (also attached as a `.json` file to the email)

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- A Gmail account with [2-Step Verification](https://myaccount.google.com/signinoptions/two-step-verification) enabled
- A Gmail [App Password](https://myaccount.google.com/apppasswords) generated for this application

> **Gmail App Password note:** In your Gmail account go to **Manage your Google Account → Security → 2-Step Verification → App passwords**. Create a password for "Mail" and copy the 16-character code into `GMAIL_APP_PASSWORD`. Do **not** use your normal Gmail password.

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Configure credentials
cp .env.example .env
# Edit .env and set GMAIL_USER, GMAIL_APP_PASSWORD (and optionally MAIL_TO, PORT)

# 3. Start the local Express server
npm start
```

The form will be available at **http://localhost:3000** (or the port set in `.env`).

> **Note:** `server.js` is used for local development only. The production deployment on Vercel uses the serverless function at `api/submit.js` instead.

## Deploying to Vercel

The project is structured for zero-config Vercel deployment:

- Static frontend is served from `public/`
- Form submissions are handled by the serverless function at `api/submit.js`

### Step 1 – Import the repository in Vercel

1. Go to [vercel.com](https://vercel.com) → **New Project**
2. Import this GitHub repository
3. Leave all build settings as defaults (Vercel auto-detects `vercel.json`)

### Step 2 – Add environment variables in Vercel

In your Vercel project go to **Settings → Environment Variables** and add:

| Variable             | Value                                              |
|----------------------|----------------------------------------------------|
| `GMAIL_USER`         | Gmail address used as the sender                   |
| `GMAIL_APP_PASSWORD` | Gmail App Password (16-character code)             |
| `MAIL_TO`            | `massimoperfetti4@gmail.com` (or your recipient)   |

### Step 3 – Deploy and verify

1. Trigger a new deployment (or push a commit).
2. Open the deployed URL and submit the form.
3. Check Vercel **Logs** (Functions tab) for `[submit] Email sent successfully`.
4. Confirm the email arrives at `massimoperfetti4@gmail.com`.

## Environment Variables

| Variable             | Required | Description                                                   |
|----------------------|----------|---------------------------------------------------------------|
| `GMAIL_USER`         | Yes      | Gmail address used as the sender                              |
| `GMAIL_APP_PASSWORD` | Yes      | Gmail App Password (not your account password)                |
| `MAIL_TO`            | Yes      | Recipient email (e.g. `massimoperfetti4@gmail.com`)           |
| `PORT`               | No       | Port for local Express server (default: `3000`)               |
