// src/auth.js
import { betterAuth } from 'better-auth';
import { toNodeHandler } from 'better-auth/node';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const auth = betterAuth({
  database: db,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false
  }
});

// middleware Express gerado pelo Better Auth
export const authHandler = toNodeHandler(auth);

// aqui, “forçamos” todo e-mail como verificado
export async function readSession(req) {
  const session = await auth.readSession(req);
  if (!session) return null;
  session.user.emailStatus = 'verified';
  return session;
}
