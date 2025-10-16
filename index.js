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
    
    // Create the contacts table if it doesn't exist
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
    
    // Test insertion
    const testResult = await query('SELECT COUNT(*) FROM contacts');
    console.log(`📊 Current contacts in database: ${testResult.rows[0].count}`);
    
  } catch (err) {
    console.error('❌ Database initialization error:', err);
    console.error('❌ Full error details:', err.stack);
  }
}

// Initialize database when server starts
initializeDatabase();

// Health check endpoint to verify database
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

// Your contact form endpoint
app.post('/api/contact', async (req, res) => {
  console.log('📨 Received contact form:', req.body);
  
  const { name, email, message, phone, company, purpose } = req.body || {};

  // Validate required fields
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
    
    console.log('📊 Executing query with values:', values);
    
    const { rows } = await query(insertSql, values);
    const created = rows[0];
    
    console.log('✅ Successfully saved contact with ID:', created.id);

    // Email notification (optional - your existing code)
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SEND_TO) {
      try {
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

        await transporter.sendMail(mailOptions);
        console.log('📧 Notification email sent successfully');
      } catch (emailError) {
        console.error('⚠️ Failed to send notification email', emailError);
        // Don't fail the request if email fails
      }
    }

    return res.status(200).json({ 
      ok: true, 
      id: created.id, 
      created_at: created.created_at,
      message: 'Contact saved successfully' 
    });
    
  } catch (err) {
    console.error('❌ Database error details:', err);
    console.error('❌ Error message:', err.message);
    
    // Provide helpful error message
    let userMessage = 'Failed to save contact to database';
    if (err.code === '42P01') { // Table doesn't exist
      userMessage = 'Database configuration issue. Please try again in a moment.';
    }
    
    return res.status(500).json({ 
      error: userMessage,
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
      contact: '/api/contact'
    },
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Contact server listening on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 Database: ${process.env.DATABASE_URL ? 'Connected' : 'Not configured'}`);
});