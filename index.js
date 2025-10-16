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
  const configured = process.env.SMTP_HOST && 
                    process.env.SMTP_USER && 
                    process.env.SMTP_PASS && 
                    process.env.SEND_TO;
  
  console.log('📧 Email configuration check:', {
    SMTP_HOST: !!process.env.SMTP_HOST,
    SMTP_USER: !!process.env.SMTP_USER,
    SMTP_PASS: !!process.env.SMTP_PASS,
    SEND_TO: !!process.env.SEND_TO,
    FullyConfigured: configured
  });
  
  return configured;
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
    // Add timeout settings
    connectionTimeout: 30000, // 30 seconds
    greetingTimeout: 30000,   // 30 seconds  
    socketTimeout: 30000,     // 30 seconds
    // For Gmail specifically
    tls: {
      rejectUnauthorized: false
    }
  });
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
      email_configured: isEmailConfigured(),
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

// Test email endpoint
app.post('/test-email', async (req, res) => {
  try {
    console.log('📧 Testing email configuration...');
    
    if (!isEmailConfigured()) {
      return res.status(400).json({ 
        error: 'SMTP configuration missing',
        missing: {
          SMTP_HOST: !!process.env.SMTP_HOST,
          SMTP_USER: !!process.env.SMTP_USER,
          SMTP_PASS: !!process.env.SMTP_PASS,
          SEND_TO: !!process.env.SEND_TO
        }
      });
    }

    const transporter = createTransporter();
    await transporter.verify();
    console.log('✅ SMTP connection verified');

    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: process.env.SEND_TO,
      subject: '✅ Form Server - SMTP Test Successful',
      text: `Congratulations! Your form server email configuration is working correctly.\n\nTimestamp: ${new Date().toISOString()}\nYou will receive emails when users submit your contact form.`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: #22c55e;">✅ Form Server - SMTP Test Successful</h2>
          <p>Congratulations! Your form server email configuration is working correctly.</p>
          <div style="background: #f8fafc; padding: 15px; border-radius: 5px; margin: 10px 0;">
            <strong>Timestamp:</strong> ${new Date().toISOString()}<br>
            <strong>Server:</strong> Form Server
          </div>
          <p>You will receive emails when users submit your contact form.</p>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Test email sent successfully:', info.messageId);

    res.json({ 
      success: true, 
      message: 'Test email sent successfully',
      messageId: info.messageId 
    });

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

    // SEND EMAIL NOTIFICATION - THIS IS WHAT YOU NEED
    if (isEmailConfigured()) {
      try {
        console.log('📧 Preparing to send email notification...');
        
        const transporter = createTransporter();
        
        const mailOptions = {
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to: process.env.SEND_TO,
          subject: `📧 New Contact Form Submission from ${name}`,
          text: `
NEW CONTACT FORM SUBMISSION

Name: ${name}
Email: ${email}
Phone: ${phone || 'Not provided'}
Company: ${company || 'Not provided'}
Purpose: ${purpose || 'Not specified'}

Message:
${message}

Submitted: ${new Date().toLocaleString()}
Contact ID: ${created.id}
          `,
          html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px;">
              <h2 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 10px;">
                📧 New Contact Form Submission
              </h2>
              
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
                <div style="background: white; padding: 15px; border-radius: 5px; border-left: 4px solid #2563eb;">
                  ${message.replace(/\n/g, '<br>')}
                </div>
              </div>
              
              <div style="color: #64748b; font-size: 12px; margin-top: 20px; padding-top: 15px; border-top: 1px solid #e2e8f0;">
                <strong>Submitted:</strong> ${new Date().toLocaleString()}<br>
                <strong>Contact ID:</strong> ${created.id}<br>
                <strong>Server:</strong> Form Server
              </div>
            </div>
          `
        };

        const emailInfo = await transporter.sendMail(mailOptions);
        console.log('✅ Contact form email sent successfully:', emailInfo.messageId);
        
      } catch (emailError) {
        console.error('❌ Failed to send contact form email:', emailError);
        // Don't fail the request if email fails
      }
    } else {
      console.log('⚠️ SMTP not configured - skipping email notification');
    }

    return res.status(200).json({ 
      ok: true, 
      id: created.id, 
      created_at: created.created_at,
      message: 'Contact saved successfully' 
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
    email_configured: isEmailConfigured(),
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Contact server listening on port ${PORT}`);
  console.log(`📧 Email configured: ${isEmailConfigured() ? 'YES' : 'NO'}`);
});