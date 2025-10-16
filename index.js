const express = require('express');
const bodyParser = require('body-parser');
const { query } = require('./db');
require('dotenv').config();
const nodemailer = require('nodemailer');
const cors = require('cors');

const app = express();

// CORS
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 4000;

// Initialize Resend safely
let resend = null;
try {
  if (process.env.RESEND_API_KEY) {
    const { Resend } = require('resend');
    resend = new Resend(process.env.RESEND_API_KEY);
    console.log('✅ Resend initialized successfully');
  }
} catch (error) {
  console.error('❌ Failed to initialize Resend:', error.message);
}

// Initialize database table on startup
async function initializeDatabase() {
  try {
    console.log('🔄 Initializing database table...');
    
    await query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL,
        message TEXT NOT NULL,
        phone VARCHAR(20),
        company VARCHAR(100),
        purpose VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('✅ Contacts table created/verified successfully');
    
  } catch (err) {
    console.error('❌ Database initialization error:', err);
  }
}

// Initialize database when server starts
initializeDatabase();

// Email configuration check
function isEmailConfigured() {
  const smtpConfigured = process.env.SMTP_HOST && 
                        process.env.SMTP_USER && 
                        process.env.SMTP_PASS && 
                        process.env.SEND_TO;
  
  const resendConfigured = !!process.env.RESEND_API_KEY && !!process.env.SEND_TO;
  
  console.log('📧 Email configuration check:', {
    RESEND_API_KEY: !!process.env.RESEND_API_KEY,
    SMTP_HOST: !!process.env.SMTP_HOST,
    SMTP_USER: !!process.env.SMTP_USER,
    SMTP_PASS: !!process.env.SMTP_PASS,
    SEND_TO: !!process.env.SEND_TO,
    Resend_Configured: resendConfigured,
    SMTP_Configured: smtpConfigured
  });
  
  return resendConfigured || smtpConfigured;
}

// Create email transporter
function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    connectionTimeout: 30000,
    greetingTimeout: 30000,  
    socketTimeout: 30000,
    tls: {
      rejectUnauthorized: false
    }
  });
}

// Send notification using Resend (preferred) or SMTP fallback
async function sendFormNotification(formData, contactId) {
  const { name, email, message, phone, company, purpose } = formData;

  // Try Resend first if available
  if (resend && process.env.RESEND_API_KEY && process.env.SEND_TO) {
    try {
      console.log('📧 Sending email via Resend API...');
      const { data, error } = await resend.emails.send({
        from: 'Form Server <onboarding@resend.dev>',
        to: [process.env.SEND_TO],
        subject: `📧 New Contact from ${name}`,
        html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px;">
          <h2 style="color: #2563eb;">New Contact Form Submission</h2>
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px;">
            <h3>Contact Details:</h3>
            <table style="width: 100%;">
              <tr><td style="padding: 8px 0; font-weight: bold;">Name:</td><td>${name}</td></tr>
              <tr><td style="padding: 8px 0; font-weight: bold;">Email:</td><td><a href="mailto:${email}">${email}</a></td></tr>
              <tr><td style="padding: 8px 0; font-weight: bold;">Phone:</td><td>${phone || 'Not provided'}</td></tr>
              <tr><td style="padding: 8px 0; font-weight: bold;">Company:</td><td>${company || 'Not provided'}</td></tr>
              <tr><td style="padding: 8px 0; font-weight: bold;">Purpose:</td><td>${purpose || 'Not specified'}</td></tr>
            </table>
            
            <h3 style="margin-top: 20px;">Message:</h3>
            <div style="background: white; padding: 15px; border-radius: 5px;">
              ${message.replace(/\n/g, '<br>')}
            </div>
          </div>
          <div style="color: #64748b; font-size: 12px; margin-top: 20px;">
            <strong>Submitted:</strong> ${new Date().toLocaleString()}<br>
            <strong>Contact ID:</strong> ${contactId}
          </div>
        </div>
        `
      });

      if (error) {
        console.error('❌ Resend API error:', error);
        // Fall through to SMTP
      } else {
        console.log('✅ Email sent via Resend:', data?.id || '(no id)');
        return true;
      }
    } catch (error) {
      console.error('❌ Resend failed:', error.message);
      // Fall through to SMTP
    }
  }

  // SMTP fallback
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SEND_TO) {
    try {
      console.log('📧 Attempting SMTP fallback...');
      const transporter = createTransporter();
      
      // Test connection first
      await transporter.verify();
      console.log('✅ SMTP connection verified');

      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: process.env.SEND_TO,
        subject: `📧 New Contact from ${name}`,
        text: `NEW CONTACT FORM SUBMISSION\n\nName: ${name}\nEmail: ${email}\nPhone: ${phone || 'Not provided'}\nCompany: ${company || 'Not provided'}\nPurpose: ${purpose || 'Not specified'}\n\nMessage:\n${message}\n\nSubmitted: ${new Date().toLocaleString()}\nContact ID: ${contactId}`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px;">
            <h2 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 10px;">📧 New Contact Form Submission</h2>
            <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 15px 0;">
              <h3 style="color: #374151; margin-top: 0;">Contact Details:</h3>
              <table style="width: 100%;">
                <tr><td style="padding: 8px 0; font-weight: bold; width: 100px;">Name:</td><td>${name}</td></tr>
                <tr><td style="padding: 8px 0; font-weight: bold;">Email:</td><td><a href="mailto:${email}">${email}</a></td></tr>
                <tr><td style="padding: 8px 0; font-weight: bold;">Phone:</td><td>${phone || 'Not provided'}</td></tr>
                <tr><td style="padding: 8px 0; font-weight: bold;">Company:</td><td>${company || 'Not provided'}</td></tr>
                <tr><td style="padding: 8px 0; font-weight: bold;">Purpose:</td><td>${purpose || 'Not specified'}</td></tr>
              </table>
              <h3 style="color: #374151; margin-top: 20px;">Message:</h3>
              <div style="background: white; padding: 15px; border-radius: 5px; border-left: 4px solid #2563eb;">${message.replace(/\n/g, '<br>')}</div>
            </div>
            <div style="color: #64748b; font-size: 12px; margin-top: 20px; padding-top: 15px; border-top: 1px solid #e2e8f0;">
              <strong>Submitted:</strong> ${new Date().toLocaleString()}<br>
              <strong>Contact ID:</strong> ${contactId}<br>
              <strong>Server:</strong> Form Server
            </div>
          </div>
        `
      };

      const info = await transporter.sendMail(mailOptions);
      console.log('✅ SMTP fallback email sent:', info?.messageId || '(no id)');
      return true;
    } catch (smtpErr) {
      console.error('❌ SMTP fallback failed:', smtpErr.message);
      return false;
    }
  }

  console.log('⚠️ No email method configured');
  return false;
}

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    await query('SELECT 1');
    const tableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'contacts'
      )
    `);
    
    res.json({ 
      status: 'OK', 
      database: 'Connected',
      table_exists: tableCheck.rows[0].exists,
      email: {
        resend_configured: !!process.env.RESEND_API_KEY,
        smtp_configured: !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
        send_to: !!process.env.SEND_TO
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ 
      status: 'ERROR', 
      database: 'Disconnected',
      error: err.message 
    });
  }
});

// Improved test email endpoint
app.post('/test-email', async (req, res) => {
  try {
    console.log('📧 Testing email configuration...');
    
    if (!isEmailConfigured()) {
      return res.status(400).json({ 
        error: 'No email method configured',
        config: {
          resend: !!process.env.RESEND_API_KEY,
          smtp: !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
          send_to: !!process.env.SEND_TO
        }
      });
    }

    const testData = {
      name: 'Test User',
      email: 'test@example.com',
      message: 'This is a test message to verify email functionality is working correctly.',
      phone: '123-456-7890',
      company: 'Test Company',
      purpose: 'testing'
    };

    const success = await sendFormNotification(testData, 999);

    if (success) {
      res.json({ 
        success: true, 
        message: 'Test email sent successfully! Check your inbox.',
        method: process.env.RESEND_API_KEY ? 'Resend' : 'SMTP'
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to send test email with all configured methods' 
      });
    }

  } catch (error) {
    console.error('❌ Email test failed:', error);
    res.status(500).json({ 
      error: 'Failed to send test email',
      details: error.message 
    });
  }
});

// Your contact form endpoint
app.post('/api/contact', async (req, res) => {
  console.log('📨 Received contact form:', req.body);
  
  const { name, email, message, phone, company, purpose } = req.body || {};

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Missing required fields: name, email, message' });
  }

  try {
    console.log('💾 Attempting to save contact to database...');
    
    const insertSql = `
      INSERT INTO contacts (name, email, message, phone, company, purpose) 
      VALUES ($1, $2, $3, $4, $5, $6) 
      RETURNING id, created_at
    `;
    const values = [
      name.trim(), 
      email.trim(), 
      message.trim(), 
      phone ? phone.trim() : null, 
      company ? company.trim() : null, 
      purpose ? purpose.trim() : null
    ];
    
    const { rows } = await query(insertSql, values);
    const created = rows[0];
    
    console.log('✅ Successfully saved contact with ID:', created.id);

    // Send email notification
    const emailSent = await sendFormNotification(
      { name, email, message, phone, company, purpose }, 
      created.id
    );

    return res.status(200).json({ 
      ok: true, 
      id: created.id, 
      created_at: created.created_at,
      message: 'Contact saved successfully',
      notification_sent: emailSent
    });
    
  } catch (err) {
    console.error('❌ Database error:', err);
    return res.status(500).json({ 
      error: 'Failed to save contact',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Contact form server is running!',
    endpoints: {
      health: '/health',
      contact: '/api/contact',
      test_email: '/test-email'
    },
    email: {
      resend_configured: !!process.env.RESEND_API_KEY,
      smtp_configured: !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
      fully_configured: isEmailConfigured()
    },
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Contact server listening on port ${PORT}`);
  console.log(`📧 Resend configured: ${process.env.RESEND_API_KEY ? 'YES' : 'NO'}`);
  console.log(`📧 SMTP configured: ${process.env.SMTP_HOST ? 'YES' : 'NO'}`);
});