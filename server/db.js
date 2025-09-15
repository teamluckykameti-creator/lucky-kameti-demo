import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { entries, winners, emailLogs, inquiries, settings, withdrawalRequests } from '../shared/schema.js';

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

export const db = drizzle(pool, { 
  schema: { 
    entries, 
    winners, 
    emailLogs, 
    inquiries, 
    settings, 
    withdrawalRequests 
  } 
});