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

    jwt: {
    secret: process.env.BETTER_AUTH_JWT_SECRET,
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  trustedOrigins: [
    process.env.FRONT_URL,
    'http://localhost:3000',
  ].filter(Boolean),
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
// src/auth.js
export async function readSession(req) {
  // 1) tenta pegar a resposta inteira
  console.log('readSession → headers.cookie:', req.headers.cookie);
  const resp = await auth.api.getSession({
    headers: { cookie: req.headers.cookie || '' },
  });
  console.log(' auth.api.getSession() retornou:', JSON.stringify(resp));
  // 2) se não vier nada ou não vier data.session, retorna null
  if (!resp || !resp.data || !resp.data.session) {
    return null;
  }

  // 3) agora sim pega a sessão
  const session = {
    ...resp.session,
    user: { ...resp.user }
  };

  // 4) busca a role no seu próprio banco
  const { rows } = await db.query(
    'SELECT type FROM "user" WHERE id = $1',
    [ session.user.id ]
  );
  session.user.role = rows[0]?.type ?? 'user';

  return session;
}