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
    requireEmailVerification: false,
    // autoSignIn: false,       // caso queira desativar o login automático após sign-up
  },
  // Permite que seu front em localhost:3000 receba o cookie
  trustedOrigins: ['http://localhost:3000'],
  advanced: {
    // Configura o cookie para contexto cross-site
    defaultCookieAttributes: {
      path:     '/',
      httpOnly: true,
      sameSite: 'none',    // ⬅️ necessário para cookies cross-site
      secure:   true       // ⬅️ necessário quando sameSite=None
    }
  },
  // Garante secure mesmo em ambiente de desenvolvimento
  useSecureCookies: true
});

// middleware Express gerado pelo Better Auth
export const authHandler = toNodeHandler(auth);

// “Forçamos” todo e-mail como verificado
export async function readSession(req) {
  const session = await auth.readSession(req);
  if (!session) return null;
  session.user.emailStatus = 'verified';
  return session;
}
