require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const path = require('path');

// Validate required environment variables at startup
const missingEnvVars = ['GMAIL_USER', 'GMAIL_APP_PASSWORD'].filter((key) => !process.env[key]);
if (missingEnvVars.length > 0) {
  console.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  console.error('Copy .env.example to .env and fill in your Gmail credentials.');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting: max 100 requests per 15 minutes per IP for the landing page
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limit for form submission: max 10 submissions per hour per IP
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many submissions from this IP. Please try again later.' },
});

// Serve the landing page
app.get('/', generalLimiter, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Validate a numeric field: returns parsed float or null; fails if value is outside [min, max]
function parseNumericField(value, min, max) {
  if (value === '' || value == null) return null;
  const num = parseFloat(value);
  if (isNaN(num)) return null;
  if (min != null && num < min) return null;
  if (max != null && num > max) return null;
  return num;
}

// Handle form submission
app.post('/submit', submitLimiter, async (req, res) => {
  const data = req.body;

  // Server-side validation of required fields
  const requiredFields = ['name', 'email', 'company', 'fieldName', 'cropType', 'plantingDate'];
  const missingFields = requiredFields.filter((f) => !data[f] || String(data[f]).trim() === '');
  if (missingFields.length > 0) {
    return res.status(400).json({ success: false, message: `Missing required fields: ${missingFields.join(', ')}` });
  }

  // Basic email format check
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(data.email)) {
    return res.status(400).json({ success: false, message: 'Invalid email address.' });
  }

  // Validate and parse numeric fields
  const numericErrors = [];
  const pH = parseNumericField(data.pH, 0, 14);
  if (data.pH && pH === null) numericErrors.push('pH must be between 0 and 14');
  const runoffCurveNumber = parseNumericField(data.runoffCurveNumber, 0, 100);
  if (data.runoffCurveNumber && runoffCurveNumber === null) numericErrors.push('Runoff Curve Number must be between 0 and 100');
  const fieldCapacity = parseNumericField(data.fieldCapacity, 0, 1);
  if (data.fieldCapacity && fieldCapacity === null) numericErrors.push('Field Capacity must be between 0 and 1');
  const wiltingPoint = parseNumericField(data.wiltingPoint, 0, 1);
  if (data.wiltingPoint && wiltingPoint === null) numericErrors.push('Wilting Point must be between 0 and 1');
  const initialSoilWater = parseNumericField(data.initialSoilWater, 0, 100);
  if (data.initialSoilWater && initialSoilWater === null) numericErrors.push('Initial Soil Water must be between 0 and 100');

  if (numericErrors.length > 0) {
    return res.status(400).json({ success: false, message: numericErrors.join('; ') });
  }

  // Build structured JSON payload
  const payload = {
    submittedAt: new Date().toISOString(),
    personalInfo: {
      name: data.name,
      email: data.email,
      company: data.company,
      fieldName: data.fieldName,
    },
    cropGeneticCoefficients: {
      cropType: data.cropType,
      P1: { value: data.P1, unit: '°C·day', description: 'Degree days from emergence to end of juvenile phase' },
      P2: { value: data.P2, unit: 'day/h', description: 'Photoperiod sensitivity coefficient' },
      P5: { value: data.P5, unit: '°C·day', description: 'Degree days from silking to physiological maturity' },
      G2: { value: data.G2, unit: 'kernels/plant', description: 'Maximum kernel number per plant' },
      G3: { value: data.G3, unit: 'mg/day', description: 'Kernel filling rate during linear grain filling stage' },
      PHINT: { value: data.PHINT, unit: '°C·day', description: 'Degree days required for each leaf tip to emerge' },
    },
    soilCharacteristics: {
      soilSeries: data.soilSeries,
      soilTexture: data.soilTexture,
      soilDepth: { value: data.soilDepth, unit: 'cm', description: 'Total soil profile depth' },
      bulkDensity: { value: data.bulkDensity, unit: 'g/cm³', description: 'Soil bulk density' },
      fieldCapacity: { value: fieldCapacity, unit: 'cm³/cm³', description: 'Volumetric water content at field capacity' },
      wiltingPoint: { value: wiltingPoint, unit: 'cm³/cm³', description: 'Volumetric water content at wilting point' },
      organicCarbon: { value: data.organicCarbon, unit: '%', description: 'Soil organic carbon content' },
      pH: { value: pH, unit: 'pH units', description: 'Soil pH' },
      runoffCurveNumber: { value: runoffCurveNumber, unit: 'dimensionless', description: 'SCS runoff curve number' },
    },
    managementPractices: {
      plantingDate: data.plantingDate,
      plantDensity: { value: data.plantDensity, unit: 'plants/m²', description: 'Plant population density' },
      rowSpacing: { value: data.rowSpacing, unit: 'cm', description: 'Row spacing' },
      initialSoilWater: { value: initialSoilWater, unit: '% of AWC', description: 'Initial soil water content (% of available water capacity)' },
      nitrogenFertilizer: { value: data.nitrogenFertilizer, unit: 'kg N/ha', description: 'Total nitrogen fertilizer applied' },
      fertilizerDate: data.fertilizerDate,
      irrigationAmount: { value: data.irrigationAmount, unit: 'mm', description: 'Total irrigation applied' },
      irrigationDate: data.irrigationDate,
    },
  };

  const jsonString = JSON.stringify(payload, null, 2);

  // Configure Gmail transporter
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  const mailOptions = {
    from: `"DSSAT Field Form" <${process.env.GMAIL_USER}>`,
    to: 'massimoperfetti4@gmail.com',
    subject: `DSSAT Field Submission – ${data.fieldName || 'Unknown Field'} by ${data.name || 'Unknown User'}`,
    text: `A new DSSAT field data submission has been received.\n\nSubmitted by: ${data.name} (${data.email})\nCompany: ${data.company}\nField: ${data.fieldName}\n\nFull JSON data attached.`,
    html: `
      <h2>New DSSAT Field Submission</h2>
      <p><strong>Submitted by:</strong> ${escapeHtml(data.name)} (${escapeHtml(data.email)})</p>
      <p><strong>Company:</strong> ${escapeHtml(data.company)}</p>
      <p><strong>Field:</strong> ${escapeHtml(data.fieldName)}</p>
      <p><strong>Submitted at:</strong> ${payload.submittedAt}</p>
      <h3>Full JSON Data:</h3>
      <pre style="background:#f4f4f4;padding:16px;border-radius:6px;font-size:13px;overflow:auto;">${escapeHtml(jsonString)}</pre>
    `,
    attachments: [
      {
        filename: `dssat_${(data.fieldName || 'field').replace(/\s+/g, '_')}_${Date.now()}.json`,
        content: jsonString,
        contentType: 'application/json',
      },
    ],
  };

  try {
    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: 'Your data has been submitted successfully!' });
  } catch (err) {
    console.error('Email send error:', err);
    res.status(500).json({ success: false, message: 'Failed to send email. Please try again later.' });
  }
});

function escapeHtml(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

app.listen(PORT, () => {
  console.log(`DSSAT Form server running at http://localhost:${PORT}`);
});
