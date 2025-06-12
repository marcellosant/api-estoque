const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');

const app = express();     
app.use(cors());           
app.use(express.json());
// Configuração do banco MySQL
require('dotenv').config();
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});


db.connect(err => {
  if (err) {
    console.error('Erro ao conectar ao banco:', err.message);
    return;
  }
  console.log('Conectado ao banco MySQL!');
});

const crypto = require('crypto');

// POST - cadastrar novo usuário
app.post('/usuarios', (req, res) => {
  const { nome, email, senha, tipo } = req.body;

  if (!nome || !email || !senha) {
    return res.status(400).json({ error: 'Campos obrigatórios: nome, email, senha' });
  }

  const salt = crypto.randomBytes(10).toString('hex'); // 20 caracteres
  const hash_senha = crypto
    .pbkdf2Sync(senha, salt, 1000, 32, 'sha256')
    .toString('hex');

  const sql = 'INSERT INTO usuario (nome, email, hash_senha, salt, tipo) VALUES (?, ?, ?, ?, ?)';
  db.query(sql, [nome, email, hash_senha, salt, tipo || 'c'], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ message: 'Usuário cadastrado!', id: result.insertId });
  });
});

// POST - login de usuário
const jwt = require('jsonwebtoken');
const SECRET_KEY = process.env.JWT_SECRET;
 // Chave secreta para assinar o token JWT tem que alterar para algo mais seguro em produção!

app.post('/login', (req, res) => {
  const { email, senha } = req.body;

  if (!email || !senha) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });
  }

  const sql = 'SELECT * FROM usuario WHERE email = ?';
  db.query(sql, [email], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.status(401).json({ error: 'Usuário não encontrado' });

    const usuario = results[0];
    const hashVerificada = crypto
      .pbkdf2Sync(senha, usuario.salt, 1000, 32, 'sha256')
      .toString('hex');

    if (hashVerificada !== usuario.hash_senha) {
      return res.status(401).json({ error: 'Senha incorreta' });
    }

    // Gera token JWT
    const token = jwt.sign(
      { id_usuario: usuario.id_usuario, tipo: usuario.tipo },
      SECRET_KEY,
      { expiresIn: '1h' }
    );

    res.json({ message: 'Login realizado com sucesso!', token });
  });
});


// GET - puxar todos os produtos
app.get('/produtos', (req, res) => {
  const sql = 'SELECT id_produto AS id, nome, descricao, qntd_estoq FROM produto';
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: err });

    res.json({
      results,
      page: {
        count: results.length,
        next: false,
        previous: false
      }
    });
  });
});


// POST - cadastrar novo produto
app.post('/produtos', (req, res) => {
  const { nome, descricao, qntd_estoq } = req.body;
  const sql = 'INSERT INTO produto (nome, descricao, qntd_estoq) VALUES (?, ?, ?)';
  db.query(sql, [nome, descricao, qntd_estoq], (err, result) => {
    if (err) return res.status(500).json({ error: err });
    res.status(201).json({ message: 'Produto cadastrado!', id: result.insertId });
  });
});

// PUT - atualizar dados de um produto
app.put('/produtos/:id', (req, res) => {
  const { id } = req.params;
  const { nome, descricao, qntd_estoq } = req.body;
  const sql = 'UPDATE produto SET nome = ?, descricao = ?, qntd_estoq = ? WHERE id_produto = ?';
  db.query(sql, [nome, descricao, qntd_estoq, id], (err, result) => {
    if (err) return res.status(500).json({ error: err });
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Produto não encontrado' });
    res.json({ message: 'Produto atualizado!' });
  });
});
console.log("Rota POST /usuarios registrada!");
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`API rodando na porta ${PORT}`);
});
