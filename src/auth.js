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

export const auth = betterAuth({
  database: db,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false
  }
});

// helper para seu middleware de rota protegida
export const readSession = auth.readSession;

// o “router” do Better Auth para Express
export const authHandler = toNodeHandler(auth);
