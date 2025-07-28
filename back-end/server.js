const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const port = 3000;

app.use(cors());
app.use(bodyParser.json());

const dbPath = path.join(__dirname, 'db', 'barbearia.db');

// Conexão com banco
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Erro ao conectar ao banco:', err);
  } else {
    console.log(`✅ Banco conectado com sucesso: ${dbPath}`);
  }
});

// ==============================
// ROTAS - BARBEIROS
// ==============================

// Criar novo barbeiro
app.post('/barbers', (req, res) => {
  const { nome, telefone } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome é obrigatório.' });

  db.run('INSERT INTO barbers (nome, telefone) VALUES (?, ?)', [nome, telefone || null], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, message: 'Barbeiro cadastrado com sucesso.' });
  });
});

// Listar barbeiros
app.get('/barbers', (req, res) => {
  db.all('SELECT * FROM barbers', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Atualizar barbeiro
app.put('/barbers/:id', (req, res) => {
  const { nome, telefone } = req.body;
  const id = req.params.id;
  if (!nome) return res.status(400).json({ error: 'Nome é obrigatório.' });

  db.run('UPDATE barbers SET nome = ?, telefone = ? WHERE id = ?', [nome, telefone || null, id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Barbeiro não encontrado.' });
    res.json({ message: 'Barbeiro atualizado com sucesso.' });
  });
});

// Remover barbeiro
app.delete('/barbers/:id', (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM barbers WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Barbeiro não encontrado.' });
    res.json({ message: 'Barbeiro removido com sucesso.' });
  });
});

// ==============================
// ROTAS - AGENDA
// ==============================

// Listar agendamentos
app.get('/appointments', (req, res) => {
  db.all('SELECT * FROM appointments', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Criar agendamento com verificação de conflito
app.post('/appointments', (req, res) => {
  const { barber_id, cliente_nome, cliente_numero, data_hora } = req.body;

  if (!barber_id || !cliente_nome || !cliente_numero || !data_hora) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
  }

  // Verifica se já existe agendamento no mesmo horário com o mesmo barbeiro
  db.get(
    'SELECT * FROM appointments WHERE barber_id = ? AND data_hora = ?',
    [barber_id, data_hora],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });

      if (row) {
        // Já existe um agendamento
        return res.status(409).json({ error: 'Horário já está ocupado para esse barbeiro.' });
      }

      // Se não existe, insere novo agendamento
      db.run(
        'INSERT INTO appointments (barber_id, cliente_nome, cliente_numero, data_hora) VALUES (?, ?, ?, ?)',
        [barber_id, cliente_nome, cliente_numero, data_hora],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ id: this.lastID, message: 'Agendamento criado com sucesso.' });
        }
      );
    }
  );
});

// Atualizar agendamento
app.put('/appointments/:id', (req, res) => {
  const { data_hora } = req.body;
  const id = req.params.id;
  if (!data_hora) return res.status(400).json({ error: 'Data/hora obrigatória.' });

  db.run('UPDATE appointments SET data_hora = ? WHERE id = ?', [data_hora, id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Agendamento atualizado com sucesso.' });
  });
});

// Remover agendamento
app.delete('/appointments/:id', (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM appointments WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Agendamento removido com sucesso.' });
  });
});

// ==============================
// ROTAS - CONFIGURAÇÕES
// ==============================

// Buscar informações institucionais
app.get('/info', (req, res) => {
  db.all('SELECT * FROM config', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const config = {};
    rows.forEach(r => config[r.chave] = r.valor);
    res.json(config);
  });
});

// Atualizar informações institucionais
app.put('/info', (req, res) => {
  const { endereco, sobre } = req.body;
  if (!endereco || !sobre) return res.status(400).json({ error: 'Campos obrigatórios.' });

  db.serialize(() => {
    db.run('REPLACE INTO config (chave, valor) VALUES (?, ?)', ['endereco', endereco]);
    db.run('REPLACE INTO config (chave, valor) VALUES (?, ?)', ['descricao', sobre], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Informações salvas com sucesso.' });
    });
  });
});

// ==============================
// INICIAR SERVIDOR
// ==============================
app.listen(port, () => {
  console.log(`🌐 Servidor rodando em http://localhost:${port}`);
});
