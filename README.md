# dualenergy-json-form

A temporary landing page where users can submit DSSAT crop modelling parameters (crop-specific genetic coefficients, soil characteristics, and management practices) along with their contact details. On submission, the data is serialised to JSON and sent via Gmail to **massimoperfetti4@gmail.com**.

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

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure credentials
cp .env.example .env
# Edit .env and set GMAIL_USER and GMAIL_APP_PASSWORD

# 3. Start the server
npm start
```

The form will be available at **http://localhost:3000** (or the port set in `.env`).

## Environment Variables

| Variable             | Description                                         |
|----------------------|-----------------------------------------------------|
| `GMAIL_USER`         | Gmail address used as the sender                    |
| `GMAIL_APP_PASSWORD` | Gmail App Password (not your account password)      |
| `PORT`               | Port the server listens on (default: `3000`)        |
