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
      sameSite: 'none',                              // mantém para cross-site
      secure:   process.env.NODE_ENV === 'production',// apenas em prod
      // domain: undefined                           // omitido em dev (host-only)
    },
  },
  useSecureCookies: process.env.NODE_ENV === 'production',
});

// monta o handler do Better Auth
export const authHandler = toNodeHandler(auth);

// agora usa o client interno para ler a sessão a partir do cookie
// src/auth.js
// src/auth.js
export async function readSession(req) {
  const cookie = req.headers.cookie || '';
  const resp   = await auth.api.getSession({ headers:{ cookie } });

  if (!resp?.session || !resp?.user) return null;

  // campos de sessão sem o user
  const session = { ...resp.session };

  // objeto user separado
  const user = { ...resp.user };

  // aqui use user.id, não session.user.id
  const { rows } = await db.query(
    'SELECT "type" FROM "user" WHERE id = $1',
    [ user.id ]
  );
  user.role = rows[0]?.type ?? 'user';

  // devolva ambos
  return { session, user };
}