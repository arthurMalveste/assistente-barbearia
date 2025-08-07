const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

const db = new sqlite3.Database('./db/barbearia.db');

(async () => {
  const nome = 'Barbearia X';
  const email = 'y@dominio.com';
  const senha = 'senha456';
  const senha_hash = await bcrypt.hash(senha, 10);
  const api_key = require('crypto').randomUUID();

  db.run(
    `INSERT INTO barbearias (nome_barbearia, email, senha_hash, api_key, data_criacao) VALUES (?, ?, ?, ?, datetime('now'))`,
    [nome, email, senha_hash, api_key],
    function (err) {
      if (err) {
        console.error('❌ Erro ao inserir barbearia:', err.message);
      } else {
        console.log('✅ Barbearia criada com sucesso.');
      }
      db.close();
    }
  );
})();
