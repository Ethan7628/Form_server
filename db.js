const { Pool } = require('pg');
require('dotenv').config();

const connectionString = "postgresql://form_inputs_user:RG8kSXOIm6f4G0WdQrQzuvQJHAA6F7D9@dpg-d3oeen63jp1c73bu0ba0-a/form_inputs";

if (!connectionString) {
  console.error('Missing DATABASE_URL in environment. Exiting.');
  process.exit(1);
}

const pool = new Pool({ connectionString });

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
