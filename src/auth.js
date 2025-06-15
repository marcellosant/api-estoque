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
    requireEmailVerification: false,
    // autoSignIn: false,   // opcional
  },
  // usamos a mesma FRONT_URL do app.js
  trustedOrigins: [
    process.env.FRONT_URL, 
    'http://localhost:3000'
  ],
  advanced: {
    defaultCookieAttributes: {
      path:     '/',
      httpOnly: true,
      sameSite: 'none',  // necessário para cross-site
      secure:   true     // obrigatório com SameSite=None
    }
  },
  useSecureCookies: true   // força Secure mesmo em dev
});

// exporta o handler e o leitor de sessão pro Express
export const authHandler = toNodeHandler(auth);
export async function readSession(req) {
  const session = await auth.readSession(req);
  if (!session) return null;
  session.user.emailStatus = 'verified';
  return session;
}
