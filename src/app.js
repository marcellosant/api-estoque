// src/app.js
import express from 'express';
import cors from 'cors';
import { authHandler, readSession } from './auth.js';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import ExcelJS from 'exceljs';

dotenv.config();

const app = express();

// DEBUG: loga todas as requisições
app.use((req, res, next) => {
  console.log(`→ ${req.method} ${req.originalUrl}`);
  next();
});

// CORS global + preflight
const FRONT_URL = process.env.FRONT_URL;  // ex: https://meu-front.onrender.com
const ALLOWED = [FRONT_URL, 'http://localhost:3000'];
app.use(cors({
  origin: (origin, callback) => {
    // em dev origin pode vir undefined (cURL), então permitimos também
    if (!origin || ALLOWED.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('Não autorizado pela CORS'));
  },
  credentials: true
}));
app.options('*', cors({ origin: ALLOWED, credentials: true }));

// Monta o handler do Better Auth ANTES de parsear JSON
app.all('/api/auth/*', authHandler);

// Parser de JSON para *todas* as demais rotas (produtos, etc)
app.use(express.json());

// Conexão com o banco (Postgres via Neon)
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Middleware de sessão — agora com try/catch pra não vazar um hang
async function autenticarUsuario(req, res, next) {
  try {
    const session = await readSession(req);
    if (!session) {
      console.warn('Usuário não autenticado em', req.originalUrl);
      return res.status(401).json({ error: 'Não autenticado' });
    }
    req.user = session.user;
    next();
  } catch (err) {
    console.error('Erro interno em autenticarUsuario:', err);
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
        'INSERT INTO movimentacao (user_id, id_produto, tipo, qntd) VALUES ($1, $2, $3, $4)',
        [req.user.id, id, tipo, Math.abs(diferenca)]
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

// rota do usuário logado
app.get('/me', autenticarUsuario, (req, res) => {
  res.json({ usuario: req.user });
});

// =======================
// INICIA SERVIDOR
// =======================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API rodando na porta ${PORT}`));