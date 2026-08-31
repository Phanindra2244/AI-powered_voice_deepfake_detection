import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

let pool = null;
let isPostgresConnected = false;

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URI;

if (connectionString || process.env.PGHOST) {
  try {
    const config = connectionString
      ? { connectionString, ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false }
      : {
          host: process.env.PGHOST || 'localhost',
          port: Number(process.env.PGPORT) || 5432,
          user: process.env.PGUSER || 'postgres',
          password: process.env.PGPASSWORD || '',
          database: process.env.PGDATABASE || 'voiceguard_db',
          ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false
        };

    pool = new Pool(config);

    pool.on('error', (err) => {
      console.warn('[POSTGRES POOL WARN]: Pool connection error:', err.message);
      isPostgresConnected = false;
    });

    // Test connection
    pool.query('SELECT NOW()', (err, res) => {
      if (err) {
        console.warn(`⚠️ PostgreSQL connection attempt failed (${err.message}). Using SQLite fallback mode.`);
        isPostgresConnected = false;
      } else {
        isPostgresConnected = true;
        console.log(`✅ PostgreSQL Connected Successfully to ${process.env.PGDATABASE || 'Database'} (${res.rows[0].now})`);
      }
    });
  } catch (e) {
    console.warn(`⚠️ PostgreSQL initialization error: ${e.message}. Using SQLite fallback mode.`);
    isPostgresConnected = false;
  }
} else {
  console.log('ℹ️ No PostgreSQL environment variables provided. Operating in SQLite database mode.');
}

export async function query(text, params) {
  if (pool && isPostgresConnected) {
    try {
      const res = await pool.query(text, params);
      return res;
    } catch (err) {
      console.error('[POSTGRES QUERY ERROR]:', err.message);
      throw err;
    }
  }
  return null;
}

export function isPostgresActive() {
  return isPostgresConnected;
}

export function getPool() {
  return pool;
}
