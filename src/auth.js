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
// src/auth.js
export async function readSession(req) {
  // 1) pega o cookie cru
  const cookie = req.headers.cookie || '';
  console.log('→ readSession headers.cookie:', cookie);

  // 2) chama o Better Auth
  const resp = await auth.api.getSession({
    headers: { cookie }
  });
  console.log('→ auth.api.getSession() retornou:', resp);

  // 3) se não vier session ou user, aborta
  if (!resp || !resp.session || !resp.user) {
    return null;
  }

  // 4) monta o objeto `session` como o seu front espera
  const session = {
    ...resp.session
  };

   const user = { ...resp.user };

  // 5) busca a role no seu próprio banco e anexa
  const { rows } = await db.query(
    'SELECT type FROM "user" WHERE id = $1',
    [ session.user.id ]
  );
  session.user.role = rows[0]?.type ?? 'user';

  return {session, user};
}
