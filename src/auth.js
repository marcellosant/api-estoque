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
  },
  trustedOrigins: [
    process.env.FRONT_URL,
    'http://localhost:3000',
  ],
  advanced: {
    defaultCookieAttributes: {
      path:     '/',
      httpOnly: true,
      sameSite: 'none',
      secure:   true,
    },
  },
  useSecureCookies: true,
});

// monta o handler do Better Auth
export const authHandler = toNodeHandler(auth);

// agora usa o client interno para ler a sessão a partir do cookie
export async function readSession(req) {
  // 1) pega a sessão “pura” do Better Auth
  const { data: { session } = {} } = await auth.api.getSession({
    headers: { cookie: req.headers.cookie || '' },
  });
  if (!session) return null;

  // 2) busca o type na sua tabela “user” (ou “usuario”)
  const { rows } = await db.query(
    'SELECT type FROM "user" WHERE id = $1',
    [ session.user.id ]
  );
  const role = rows[0]?.type ?? 'user';

  // 3) anexa em session.user
  session.user.role = role;
  return session;
}