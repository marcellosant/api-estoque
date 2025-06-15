import { betterAuth } from 'better-auth';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const auth = betterAuth({
  database: new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false
  }
});

export const readSession = auth.readSession;
export default auth.router;
