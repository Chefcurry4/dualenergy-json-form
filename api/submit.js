'use strict';

const nodemailer = require('nodemailer');

// Escape HTML special characters to prevent XSS in the email body
function escapeHtml(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Validate a numeric field; returns parsed float or null if invalid/out of range
function parseNumericField(value, min, max) {
  if (value === '' || value == null) return null;
  const num = parseFloat(value);
  if (isNaN(num)) return null;
  if (min != null && num < min) return null;
  if (max != null && num > max) return null;
  return num;
}

module.exports = async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, message: 'Method not allowed. Use POST.' });
  }

  // Check required environment variables
  const missingEnv = ['GMAIL_USER', 'GMAIL_APP_PASSWORD', 'MAIL_TO'].filter((k) => !process.env[k]);
  if (missingEnv.length > 0) {
    console.error('[submit] Missing required env vars:', missingEnv.join(', '));
    return res.status(500).json({
      success: false,
      message: 'Server configuration error. Please contact the administrator.',
    });
  }

  const data = req.body;

  // Validate required fields
  const requiredFields = ['name', 'email', 'company', 'fieldName', 'cropType', 'plantingDate'];
  const missingFields = requiredFields.filter((f) => !data[f] || String(data[f]).trim() === '');
  if (missingFields.length > 0) {
    return res.status(400).json({
      success: false,
      message: `Missing required fields: ${missingFields.join(', ')}`,
    });
  }

  // Basic email format validation
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(data.email)) {
    return res.status(400).json({ success: false, message: 'Invalid email address.' });
  }

  // Validate and parse numeric fields
  const numericErrors = [];

  const pH = parseNumericField(data.pH, 0, 14);
  if (data.pH && pH === null) numericErrors.push('pH must be between 0 and 14');

  const runoffCurveNumber = parseNumericField(data.runoffCurveNumber, 0, 100);
  if (data.runoffCurveNumber && runoffCurveNumber === null)
    numericErrors.push('Runoff Curve Number must be between 0 and 100');

  const fieldCapacity = parseNumericField(data.fieldCapacity, 0, 1);
  if (data.fieldCapacity && fieldCapacity === null)
    numericErrors.push('Field Capacity must be between 0 and 1');

  const wiltingPoint = parseNumericField(data.wiltingPoint, 0, 1);
  if (data.wiltingPoint && wiltingPoint === null)
    numericErrors.push('Wilting Point must be between 0 and 1');

  const initialSoilWater = parseNumericField(data.initialSoilWater, 0, 100);
  if (data.initialSoilWater && initialSoilWater === null)
    numericErrors.push('Initial Soil Water must be between 0 and 100');

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

  // Recipient is required via env var (checked above)
  const mailTo = process.env.MAIL_TO;

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
    to: mailTo,
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
    console.log(`[submit] Sending email to ${mailTo} for field "${data.fieldName}" by ${data.name}`);
    await transporter.sendMail(mailOptions);
    console.log('[submit] Email sent successfully');
    return res.status(200).json({ success: true, message: 'Your data has been submitted successfully!' });
  } catch (err) {
    console.error('[submit] Email send error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to send email. Please try again later.' });
  }
};
