const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = 3000;
const SECRET = 'chave-secreta-segura'; // Substituir por variável de ambiente em produção

app.use(cors());
app.use(bodyParser.json());

const dbPath = path.join(__dirname, 'db', 'barbearia.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('❌ Erro ao conectar ao banco:', err.message);
  else console.log('✅ Banco conectado com sucesso.');
});
app.post('/barbearias', async (req, res) => {
  const { nome_barbearia, email, senha } = req.body;
  if (!nome_barbearia || !email || !senha) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
  }

  const senha_hash = await bcrypt.hash(senha, 10);
  const api_key = uuidv4(); // Pode ser mantida como identificador interno (não usada no frontend)

  db.run(
    `INSERT INTO barbearias (nome_barbearia, email, senha_hash, api_key) VALUES (?, ?, ?, ?)`,
    [nome_barbearia, email, senha_hash, api_key],
    function (err) {
      if (err) return res.status(500).json({ error: 'Erro ao criar barbearia.', details: err.message });
      res.status(201).json({ message: 'Barbearia criada com sucesso.' });
    }
  );
});
app.post('/auth/login', (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ error: 'Email e senha são obrigatórios.' });

  db.get(`SELECT * FROM barbearias WHERE email = ?`, [email], async (err, barbearia) => {
    if (err) return res.status(500).json({ error: 'Erro interno ao autenticar.' });
    if (!barbearia) return res.status(401).json({ error: 'Email não encontrado.' });

    const valid = await bcrypt.compare(senha, barbearia.senha_hash);
    if (!valid) return res.status(401).json({ error: 'Senha incorreta.' });

    const token = jwt.sign({ barbearia_id: barbearia.id }, SECRET, { expiresIn: '12h' });
    res.json({ token, nome_barbearia: barbearia.nome_barbearia });
  });
});
const authenticate = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token não fornecido.' });

  jwt.verify(token, SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Token inválido.' });
    req.barbearia_id = decoded.barbearia_id;
    next();
  });
};
app.use(authenticate);
app.post('/barbers', (req, res) => {
  const { nome, telefone } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome obrigatório.' });

  db.run('INSERT INTO barbers (nome, telefone, barbearia_id) VALUES (?, ?, ?)',
    [nome, telefone || null, req.barbearia_id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID, nome, telefone });
    });
});

app.get('/barbers', (req, res) => {
  db.all('SELECT * FROM barbers WHERE barbearia_id = ?', [req.barbearia_id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.put('/barbers/:id', (req, res) => {
  const { nome, telefone } = req.body;
  const id = parseInt(req.params.id);
  if (!nome) return res.status(400).json({ error: 'Nome obrigatório.' });

  db.run('UPDATE barbers SET nome = ?, telefone = ? WHERE id = ? AND barbearia_id = ?',
    [nome, telefone || null, id, req.barbearia_id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Barbeiro não encontrado.' });
      res.json({ message: 'Atualizado com sucesso.' });
    });
});

app.delete('/barbers/:id', (req, res) => {
  const id = parseInt(req.params.id);
  db.run('DELETE FROM barbers WHERE id = ? AND barbearia_id = ?', [id, req.barbearia_id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Barbeiro não encontrado.' });
    res.json({ message: 'Removido com sucesso.' });
  });
});
app.get('/appointments', (req, res) => {
  db.all('SELECT * FROM appointments WHERE barbearia_id = ?', [req.barbearia_id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/appointments', (req, res) => {
  const { barber_id, cliente_nome, cliente_numero, data_hora } = req.body;
  if (!barber_id || !cliente_nome || !cliente_numero || !data_hora) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
  }

  db.get(`SELECT * FROM appointments WHERE barber_id = ? AND data_hora = ? AND barbearia_id = ?`,
    [barber_id, data_hora, req.barbearia_id],
    (err, existing) => {
      if (err) return res.status(500).json({ error: err.message });
      if (existing) return res.status(409).json({ error: 'Horário já ocupado.' });

      db.run(`INSERT INTO appointments (barber_id, cliente_nome, cliente_numero, data_hora, barbearia_id) VALUES (?, ?, ?, ?, ?)`,
        [barber_id, cliente_nome, cliente_numero, data_hora, req.barbearia_id],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          res.status(201).json({ id: this.lastID });
        });
    });
});

app.put('/appointments/:id', (req, res) => {
  const { barber_id, cliente_nome, cliente_numero, data_hora, status, lembrete_enviado } = req.body;
  const id = parseInt(req.params.id);

  db.run(`UPDATE appointments SET barber_id = ?, cliente_nome = ?, cliente_numero = ?, data_hora = ?, status = ?, lembrete_enviado = ? WHERE id = ? AND barbearia_id = ?`,
    [barber_id, cliente_nome, cliente_numero, data_hora, status || 'confirmado', lembrete_enviado ? 1 : 0, id, req.barbearia_id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Agendamento não encontrado.' });
      res.json({ message: 'Atualizado com sucesso.' });
    });
});

app.delete('/appointments/:id', (req, res) => {
  const id = parseInt(req.params.id);
  db.run('DELETE FROM appointments WHERE id = ? AND barbearia_id = ?', [id, req.barbearia_id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Agendamento não encontrado.' });
    res.json({ message: 'Removido com sucesso.' });
  });
});
app.get('/config', (req, res) => {
  db.all('SELECT chave, valor FROM config WHERE barbearia_id = ?', [req.barbearia_id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const config = {};
    rows.forEach(r => config[r.chave] = r.valor);
    res.json(config);
  });
});

app.post('/config', (req, res) => {
  const { chave, valor } = req.body;
  if (!chave) return res.status(400).json({ error: 'Chave obrigatória.' });

  db.run('REPLACE INTO config (barbearia_id, chave, valor) VALUES (?, ?, ?)',
    [req.barbearia_id, chave, valor],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: `Configuração "${chave}" salva.` });
    });
});
app.listen(port, () => {
  console.log(`🌐 API rodando em http://localhost:${port}`);
});
