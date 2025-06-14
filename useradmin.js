require('dotenv').config();
const { Pool } = require('pg');
const crypto = require('crypto');

// Dados do admin
const nome = 'Admin';
const email = 'admin@uepa.br';
const senha = 'admin123';

// Gera hash e salt
const salt = crypto.randomBytes(10).toString('hex');
const hash_senha = crypto.pbkdf2Sync(senha, salt, 1000, 32, 'sha256').toString('hex');

// Conexão com o banco
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Executa o INSERT
async function criarAdmin() {
  try {
    const result = await db.query(
      `INSERT INTO usuario (nome, email, hash_senha, salt, tipo)
       VALUES ($1, $2, $3, $4, $5) RETURNING id_usuario`,
      [nome, email.toLowerCase(), hash_senha, salt, 'admin']
    );

    console.log('Admin criado com sucesso! ID:', result.rows[0].id_usuario);
    await db.end();
  } catch (err) {
    console.error('Erro ao criar admin:', err.message);
    await db.end();
  }
}

criarAdmin();
