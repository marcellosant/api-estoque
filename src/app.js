// src/app.js
import express from 'express';
import cors from 'cors';
import { auth, authHandler, readSession } from './auth.js';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import ExcelJS from 'exceljs';

dotenv.config();
const app = express();

// Debug logging
app.use((req, res, next) => {
  console.log(`→ ${req.method} ${req.originalUrl}`);
  next();
});

// CORS + preflight
const FRONT_URL = process.env.FRONT_URL;
const ALLOWED = [FRONT_URL, 'http://localhost:3000'];
app.use(cors({
  origin: (o, cb) => (!o || ALLOWED.includes(o)) ? cb(null, true) : cb(new Error('CORS Block')),
  credentials: true,
}));
app.options('*', cors({ origin: ALLOWED, credentials: true }));

app.post('/api/auth/sign-out', async (req, res) => {
  try {
    // 1. invalidate the session server-side
    await auth.api.signOut({
      headers: { cookie: req.headers.cookie || '' }
    });
  } catch (err) {
    console.error('Error calling auth.api.signOut:', err);
  }
  // 2. clear the browser cookie
  res.clearCookie('better-auth.session_token', {
    path:     '/',
    httpOnly: true,
    sameSite: 'none',
    secure:   true
  });
  // 3. return valid JSON
  return res.status(200).json({ signedOut: true });
});



// retorna a sessão e o usuário logado
app.get('/api/auth/get-session', async (req, res) => {
  const result = await readSession(req);
  if (!result) {
    return res.json({ data: { session: null, user: null }, error: null });
  }
  return res.json({
    data: {
      session: result.session,
      user:    result.user
    },
    error: null
  });
});

// 1) Better Auth endpoints
app.all('/api/auth/*', authHandler);

// 2) Override sign-out so we can expire the cookie
app.post('/api/auth/sign-out', authHandler, (req, res) => {
  // clear the session cookie immediately
  res.clearCookie('better-auth.session_token', {
    path:     '/',
    httpOnly: true,
    sameSite: 'none',
    secure:   true,
  });
  // send a small JSON so the client can parse it
  return res.json({ signedOut: true });
});

// 3) JSON parser for your own routes
app.use(express.json());

// 4) DB connection
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// 5) Protect routes
async function autenticarUsuario(req, res, next) {
  try {
    const session = await readSession(req);
    if (!session) return res.status(401).json({ error: 'Não autenticado' });
    req.user = session.user;
    next();
  } catch (err) {
    console.error('Erro validar sessão:', err);
    res.status(500).json({ error: 'Erro interno ao validar sessão' });
  }
}

// =======================
// ROTAS DE PRODUTO
// =======================

app.post('/produtos', async (req, res) => {
  console.log('Recebido POST /produtos com body:', req.body);
  const { nome, descricao, qntd_estoq } = req.body;
  try {
    const result = await db.query(
      'INSERT INTO produto (nome, descricao, qntd_estoq) VALUES ($1, $2, $3) RETURNING id_produto',
      [nome, descricao, qntd_estoq]
    );
    res.status(201).json({ message: 'Produto cadastrado!', id: result.rows[0].id_produto });
  } catch (err) {
    console.error('Erro ao inserir produto:', err);
    res.status(500).json({ error: err.message });
  }
});


app.put('/produtos/:id', async (req, res) => {
  const { id } = req.params;
  const { nome, descricao, qntd_estoq } = req.body;
  try {
    const { rows } = await db.query('SELECT qntd_estoq FROM produto WHERE id_produto = $1', [id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Produto não encontrado' });

    const estoqueAnterior = rows[0].qntd_estoq;
    await db.query(
      'UPDATE produto SET nome = $1, descricao = $2, qntd_estoq = $3 WHERE id_produto = $4',
      [nome, descricao, qntd_estoq, id]
    );

    const diferenca = qntd_estoq - estoqueAnterior;
    if (diferenca !== 0) {
      const tipo = diferenca > 0 ? 'e' : 's';
      await db.query(
        `INSERT INTO movimentacao (id_produto, tipo, qntd)
         VALUES ($1, $2, $3)`,
        [id, tipo, Math.abs(diferenca)]
      );
    }

    res.json({ message: 'Produto atualizado!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/produtos', async (req, res) => {
  const page   = Math.max(parseInt(req.query.page) || 1, 1);
  const limit  = Math.max(parseInt(req.query.limit) || 10, 1);
  const offset = (page - 1) * limit;
  try {
    const totalRes    = await db.query('SELECT COUNT(*) FROM produto');
    const produtosRes = await db.query(
      'SELECT id_produto AS id, nome, descricao, qntd_estoq FROM produto ORDER BY id_produto LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    const totalItems = parseInt(totalRes.rows[0].count, 10);
    res.json({
      results: produtosRes.rows,
      page: {
        current:      page,
        total_items:  totalItems,
        total_pages:  Math.ceil(totalItems / limit),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/produtos/excel', async (req, res) => {
  try {
    const { rows: produtos } = await db.query(
      'SELECT id_produto AS id, nome, descricao, qntd_estoq FROM produto'
    );
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Produtos');
    ws.columns = [
      { header: 'ID',           key: 'id',         width: 10 },
      { header: 'Nome',         key: 'nome',       width: 30 },
      { header: 'Descrição',    key: 'descricao',  width: 50 },
      { header: 'Qtd. Estoque', key: 'qntd_estoq', width: 15 },
    ];
    produtos.forEach(p => ws.addRow(p));
    res
      .setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .setHeader('Content-Disposition', 'attachment; filename="produtos.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE - excluir produto
app.delete('/produtos/:id', async (req, res) => {
  const { id } = req.params;
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // 1) remove todas as movimentações deste produto
    await client.query(
      `DELETE FROM movimentacao
       WHERE id_produto = $1;`,
      [id]
    );

    // 2) remove o produto
    const deleteRes = await client.query(
      `DELETE FROM produto
       WHERE id_produto = $1
       RETURNING id_produto;`,
      [id]
    );

    if (deleteRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Produto não encontrado.' });
    }

    await client.query('COMMIT');
    return res.status(200).json({ message: 'Produto excluído com sucesso!' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.get('/usuarios', async (req, res) => {
  // 1) lê pagina e limite da query string, com valores mínimos
  const page   = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit  = Math.max(parseInt(req.query.limit, 10) || 10, 1);
  const offset = (page - 1) * limit;

  try {
    // 2) conta o total de registros
    const totalRes = await db.query('SELECT COUNT(*) FROM "user"');
    const totalItems = parseInt(totalRes.rows[0].count, 10);

    // 3) busca a página desejada, alias nos campos camelCase
    const usersRes = await db.query(
      `SELECT
         id,
         name,
         email,
         email_verified   AS "emailVerified",
         image,
         created_at       AS "createdAt",
         updated_at       AS "updatedAt",
         type
       FROM "user"
       ORDER BY id
       LIMIT $1
       OFFSET $2`,
      [limit, offset]
    );

    // 4) devolve o JSON no mesmo formato do /produtos
    res.json({
      results: usersRes.rows,
      page: {
        current:     page,
        total_items: totalItems,
        total_pages: Math.ceil(totalItems / limit),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// rota para fazer alteracoes no usuario
app.put('/usuarios/:id', async (req, res) => {
  const { id } = req.params;
  const { name, email } = req.body;

  // validações básicas
  if (!name || !email) {
    return res.status(400).json({ error: 'Os campos name e email são obrigatórios.' });
  }

  try {
    // atualiza name, email e updated_at
    const updateRes = await db.query(
      `UPDATE "user"
         SET name       = $1,
             email      = $2,
             updated_at = NOW()
       WHERE id = $3
       RETURNING
         id,
         name,
         email,
         email_verified   AS "emailVerified",
         image,
         created_at       AS "createdAt",
         updated_at       AS "updatedAt",
         type;`,
      [name, email, id]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    // devolve o usuário atualizado
    res.json(updateRes.rows[0]);
  } catch (err) {
    // trata erro de chave única (e-mail duplicado)
    if (err.code === '23505' && err.constraint === 'user_email_key') {
      return res.status(409).json({ error: 'Este email já está em uso.' });
    }
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/usuarios/:id', async (req, res) => {
  const { id } = req.params;
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // 1. remove todas as sessões desse user
    await client.query(
      `DELETE FROM session
       WHERE "userId" = $1;`,
      [id]
    );

    // 2. remove account do usuário
    await client.query(
      `DELETE FROM account
       WHERE "userId" = $1;`,
      [id]
    );

    // 3. remove o usuário
    const deleteRes = await client.query(
      `DELETE FROM "user"
       WHERE id = $1
       RETURNING id;`,
      [id]
    );

    if (deleteRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    await client.query('COMMIT');
    return res.status(200).json({ message: 'Usuário deletado com sucesso.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// get movimentações
app.get('/movimentacoes', async (req, res) => {
  // paginação
  const page   = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit  = Math.max(parseInt(req.query.limit, 10) || 10, 1);
  const offset = (page - 1) * limit;

  try {
    // total de registros
    const totalRes = await db.query('SELECT COUNT(*) FROM movimentacao');
    const totalItems = parseInt(totalRes.rows[0].count, 10);

    // busca a página de movimentações, já fazendo JOIN para puxar o nome do produto
    const movRes = await db.query(
      `SELECT
         m.id_movi        AS id,
         m.id_produto     AS produtoId,
         p.nome           AS produtoNome,
         m.tipo           AS tipo,
         m.qntd           AS quantidade,
         m.data           AS dataMovimentacao
       FROM movimentacao m
       LEFT JOIN produto p
         ON p.id_produto = m.id_produto
       ORDER BY m.data DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    // monta o JSON de resposta
    res.json({
      results: movRes.rows,
      page: {
        current:     page,
        total_items: totalItems,
        total_pages: Math.ceil(totalItems / limit),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


// =======================
// INICIA SERVIDOR
// =======================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API rodando na porta ${PORT}`));