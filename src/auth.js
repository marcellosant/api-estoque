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
  // 1) pega a sessão original
  const { data: { session } = {} } = await auth.api.getSession({
    headers: { cookie: req.headers.cookie || '' },
  });
  if (!session) return null;

  // 2) busca a role (type) na sua tabela de usuários
  const { rows } = await db.query(
    'SELECT type FROM usuario WHERE id = $1',
    [ session.user.id ]
  );

  // 3) anexa no objeto de usuário
  session.user.role = rows[0]?.type ?? 'user';
  //  (opcional) marca email como verificado se você quiser
  session.user.emailStatus = 'verified';

  return session;
}