import pg from 'pg';
const { Pool } = pg;
// Read DATABASE_URL from process.env (loaded by dotenv in server.js)
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
export default pool;
