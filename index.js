const express = require('express');
const bodyParser = require('body-parser');
const { query } = require('./db');
require('dotenv').config();
const nodemailer = require('nodemailer');

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 4000;

app.post('/api/contact', async (req, res) => {
  const { name, email, message, phone, company, purpose } = req.body || {};

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Missing required fields: name, email, message' });
  }

  try {
    const insertSql = `INSERT INTO contacts (name, email, message, phone, company, purpose) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, created_at`;
    const values = [name, email, message, phone || null, company || null, purpose || null];
    const { rows } = await query(insertSql, values);
    const created = rows[0];

    // If SMTP configured, send a notification email
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SEND_TO) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: process.env.SEND_TO,
        subject: `New contact from ${name}`,
        text: `You have a new message:\n\nName: ${name}\nEmail: ${email}\nPhone: ${phone || '-'}\nCompany: ${company || '-'}\nPurpose: ${purpose || '-'}\n\nMessage:\n${message}`
      };

      transporter.sendMail(mailOptions).catch((err) => {
        console.error('Failed to send notification email', err);
      });
    }

    return res.status(200).json({ ok: true, id: created.id, created_at: created.created_at });
  } catch (err) {
    console.error('Error inserting contact', err);
    return res.status(500).json({ error: 'Failed to save contact' });
  }
});

app.listen(PORT, () => {
  console.log(`Contact server listening on port ${PORT}`);
});
