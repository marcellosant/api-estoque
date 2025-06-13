const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Verifica conexão
db.connect(err => {
  if (err) {
    console.error('Erro ao conectar ao PostgreSQL:', err.message);
  } else {
    console.log('Conectado ao PostgreSQL!');
  }
});

// POST - cadastrar novo usuário
app.post('/usuarios', async (req, res) => {
  const { nome, email, senha, tipo } = req.body;

  if (!nome || !email || !senha) {
    return res.status(400).json({ error: 'Campos obrigatórios: nome, email, senha' });
  }
  const emailMinusculo = email.toLowerCase(); 

  if (!emailMinusculo.includes('@uepa.br')) {
    return res.status(400).json({ error: 'Email deve ser constitucional UEPA' });
  }

  const salt = crypto.randomBytes(10).toString('hex');
  const hash_senha = crypto.pbkdf2Sync(senha, salt, 1000, 32, 'sha256').toString('hex');

  try {
    const result = await db.query(
      'INSERT INTO usuario (nome, email, hash_senha, salt, tipo) VALUES ($1, $2, $3, $4, $5) RETURNING id_usuario',
      [nome, emailMinusculo, hash_senha, salt, tipo || 'c']
    );
    res.status(201).json({ message: 'Usuário cadastrado!', id: result.rows[0].id_usuario });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST - login de usuário
const SECRET_KEY = process.env.JWT_SECRET;

app.post('/login', async (req, res) => {
  const { email, senha } = req.body;

  if (!email || !senha) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });
  }

  try {
    const result = await db.query('SELECT * FROM usuario WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Usuário não encontrado' });

    const usuario = result.rows[0];
    const hashVerificada = crypto.pbkdf2Sync(senha, usuario.salt, 1000, 32, 'sha256').toString('hex');

    if (hashVerificada !== usuario.hash_senha) {
      return res.status(401).json({ error: 'Senha incorreta' });
    }

    const token = jwt.sign(
      { id_usuario: usuario.id_usuario, tipo: usuario.tipo },
      SECRET_KEY,
      { expiresIn: '1h' }
    );

    res.json({ message: 'Login realizado com sucesso!', token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET - listar produtos
app.get('/produtos', async (req, res) => {
  try {
    const result = await db.query('SELECT id_produto AS id, nome, descricao, qntd_estoq FROM produto');
    res.json({
      results: result.rows,
      page: {
        count: result.rows.length,
        next: false,
        previous: false
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST - cadastrar produto
app.post('/produtos', async (req, res) => {
  const { nome, descricao, qntd_estoq } = req.body;
  try {
    const result = await db.query(
      'INSERT INTO produto (nome, descricao, qntd_estoq) VALUES ($1, $2, $3) RETURNING id_produto',
      [nome, descricao, qntd_estoq]
    );
    res.status(201).json({ message: 'Produto cadastrado!', id: result.rows[0].id_produto });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT - atualizar produto
app.put('/produtos/:id', async (req, res) => {
  const { id } = req.params;
  const { nome, descricao, qntd_estoq } = req.body;
  try {
    const result = await db.query(
      'UPDATE produto SET nome = $1, descricao = $2, qntd_estoq = $3 WHERE id_produto = $4',
      [nome, descricao, qntd_estoq, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Produto não encontrado' });
    }

    res.json({ message: 'Produto atualizado!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE - excluir produto
app.delete('/produtos/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query('DELETE FROM produto WHERE id_produto = $1', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Produto não encontrado' });
    }

    res.json({ message: 'Produto excluído!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API rodando na porta ${PORT}`);
});
