const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

const dbPath = path.join(__dirname, 'db', 'barbearia.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Erro ao conectar ao banco:', err);
  } else {
    console.log(`✅ Banco conectado com sucesso: ${dbPath}`);
  }
});

// Middleware de autenticação
const authenticate = (req, res, next) => {
  const apiKey = req.header('X-API-Key');
  if (!apiKey) return res.status(401).json({ error: 'Chave de API não fornecida.' });

  db.get('SELECT id FROM barbearias WHERE api_key = ?', [apiKey], (err, row) => {
    if (err) return res.status(500).json({ error: 'Erro no banco durante autenticação.' });
    if (!row) return res.status(403).json({ error: 'Chave de API inválida.' });

    req.barbearia_id = row.id;
    next();
  });
};

// Rota para criar barbearia (sem autenticação)
app.post('/barbearias', (req, res) => {
  const { nome_barbearia } = req.body;
  if (!nome_barbearia) return res.status(400).json({ error: 'Nome da barbearia é obrigatório.' });

  const apiKey = uuidv4();
  db.run('INSERT INTO barbearias (nome_barbearia, api_key) VALUES (?, ?)', [nome_barbearia, apiKey], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: this.lastID, nome_barbearia, api_key: apiKey, message: 'Barbearia criada com sucesso.' });
  });
});

// Aplica autenticação para rotas abaixo
app.use(authenticate);

// Rotas barbeiros
app.post('/barbers', (req, res) => {
  const { nome, telefone } = req.body;
  const barbearia_id = req.barbearia_id;
  if (!nome) return res.status(400).json({ error: 'Nome do barbeiro é obrigatório.' });

  const sql = 'INSERT INTO barbers (nome, telefone, barbearia_id) VALUES (?, ?, ?)';
  db.run(sql, [nome, telefone, barbearia_id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: this.lastID, nome, telefone, barbearia_id });
  });
});

app.get('/barbers', (req, res) => {
  const barbearia_id = req.barbearia_id;
  db.all('SELECT id, nome, telefone FROM barbers WHERE barbearia_id = ?', [barbearia_id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/barbers/:id', (req, res) => {
  const { id } = req.params;
  const barbearia_id = req.barbearia_id;
  db.get('SELECT id, nome, telefone FROM barbers WHERE id = ? AND barbearia_id = ?', [id, barbearia_id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Barbeiro não encontrado.' });
    res.json(row);
  });
});

app.put('/barbers/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });

  const { nome, telefone } = req.body;
  const barbearia_id = req.barbearia_id;
  if (!nome && !telefone) return res.status(400).json({ error: 'Informe nome ou telefone.' });

  db.run(
    'UPDATE barbers SET nome = COALESCE(?, nome), telefone = COALESCE(?, telefone) WHERE id = ? AND barbearia_id = ?',
    [nome, telefone, id, barbearia_id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Barbeiro não encontrado.' });
      res.json({ message: 'Barbeiro atualizado com sucesso.' });
    }
  );
});

app.delete('/barbers/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });

  const barbearia_id = req.barbearia_id;
  db.run('DELETE FROM barbers WHERE id = ? AND barbearia_id = ?', [id, barbearia_id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Barbeiro não encontrado.' });
    res.json({ message: 'Barbeiro excluído com sucesso.' });
  });
});

// Rotas agendamentos
app.post('/appointments', (req, res) => {
  const { barber_id, cliente_nome, cliente_numero, data_hora, status, lembrete_enviado } = req.body;
  const barbearia_id = req.barbearia_id;

  if (!barber_id || !cliente_nome || !cliente_numero || !data_hora) {
    return res.status(400).json({ error: 'Campos obrigatórios: barber_id, cliente_nome, cliente_numero, data_hora.' });
  }

  const sql = `INSERT INTO appointments (barber_id, cliente_nome, cliente_numero, data_hora, status, lembrete_enviado, barbearia_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)`;

  db.run(sql, [barber_id, cliente_nome, cliente_numero, data_hora, status, lembrete_enviado, barbearia_id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: this.lastID, barber_id, cliente_nome, cliente_numero, data_hora, barbearia_id });
  });
});

app.get('/appointments', (req, res) => {
  const barbearia_id = req.barbearia_id;
  db.all('SELECT * FROM appointments WHERE barbearia_id = ?', [barbearia_id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.delete('/appointments/:id', (req, res) => {
  const { id } = req.params;
  const barbearia_id = req.barbearia_id;
  db.run('DELETE FROM appointments WHERE id = ? AND barbearia_id = ?', [id, barbearia_id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Agendamento não encontrado.' });
    res.json({ message: 'Agendamento excluído com sucesso.' });
  });
});

app.listen(port, () => {
  console.log(`🚀 Servidor rodando na porta ${port}`);
});
