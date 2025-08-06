const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
// ALTERAÇÃO MULTI-TENANT: Adicionado para gerar chaves de API únicas e seguras
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = 3000;

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

// ==========================================================
// ALTERAÇÃO MULTI-TENANT: ROTA PÚBLICA PARA GERENCIAR BARBEARIAS
// ==========================================================

// Rota para criar uma nova barbearia (tenant). Esta é a única rota que não requer autenticação.
app.post('/barbearias', (req, res) => {
  const { nome_barbearia } = req.body;
  if (!nome_barbearia) {
    return res.status(400).json({ error: 'O nome da barbearia é obrigatório.' });
  }
  const apiKey = uuidv4(); // Gera uma chave de API única

  db.run('INSERT INTO barbearias (nome_barbearia, api_key) VALUES (?, ?)', [nome_barbearia, apiKey], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Erro ao criar a barbearia.', details: err.message });
    }
    console.log(`[TENANT CREATED] Barbearia '${nome_barbearia}' criada com ID ${this.lastID}`);
    res.status(201).json({ id: this.lastID, nome_barbearia, api_key: apiKey });
  });
});

// ==========================================================
// ALTERAÇÃO MULTI-TENANT: MIDDLEWARE DE AUTENTICAÇÃO - O GUARDIÃO
// ==========================================================

const authenticate = (req, res, next) => {
    const apiKey = req.header('X-API-Key');
    if (!apiKey) {
        return res.status(401).json({ error: 'Acesso não autorizado. Chave de API não fornecida.' });
    }

    db.get('SELECT id FROM barbearias WHERE api_key = ?', [apiKey], (err, row) => {
        if (err) {
            return res.status(500).json({ error: 'Erro interno do servidor ao validar a chave.' });
        }
        if (!row) {
            return res.status(403).json({ error: 'Acesso negado. Chave de API inválida.' });
        }
        // Anexa o ID da barbearia à requisição para ser usado em todas as rotas protegidas
        req.barbearia_id = row.id;
        next();
    });
};

// Aplica o middleware a todas as rotas definidas abaixo desta linha.
app.use(authenticate);


// ==============================
// ROTAS - BARBEIROS (PROTEGIDAS)
// ==============================

// Criar novo barbeiro PARA a barbearia autenticada
app.post('/barbers', (req, res) => {
  const { nome, telefone } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome é obrigatório.' });

  // ALTERAÇÃO MULTI-TENANT: Usa o ID da barbearia injetado pelo middleware
  const barbearia_id = req.barbearia_id;

  db.run('INSERT INTO barbers (nome, telefone, barbearia_id) VALUES (?, ?, ?)', [nome, telefone || null, barbearia_id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: this.lastID, nome, telefone, barbearia_id });
  });
});

// Listar barbeiros APENAS da barbearia autenticada
app.get('/barbers', (req, res) => {
  // ALTERAÇÃO MULTI-TENANT: Adiciona cláusula WHERE para filtrar pela barbearia
  db.all('SELECT * FROM barbers WHERE barbearia_id = ?', [req.barbearia_id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Atualizar um barbeiro da barbearia autenticada
app.put('/barbers/:id', (req, res) => {
  const { nome, telefone } = req.body;
  const id = parseInt(req.params.id);
  if (!nome) return res.status(400).json({ error: 'Nome é obrigatório.' });

  // ALTERAÇÃO MULTI-TENANT: Garante que a atualização só afete a barbearia correta
  db.run('UPDATE barbers SET nome = ?, telefone = ? WHERE id = ? AND barbearia_id = ?', [nome, telefone || null, id, req.barbearia_id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Barbeiro não encontrado ou não pertence a esta barbearia.' });
    res.json({ message: 'Barbeiro atualizado com sucesso.' });
  });
});

// Remover um barbeiro da barbearia autenticada
app.delete('/barbers/:id', (req, res) => {
  const id = parseInt(req.params.id);
  // ALTERAÇÃO MULTI-TENANT: Garante que o delete só afete a barbearia correta
  db.run('DELETE FROM barbers WHERE id = ? AND barbearia_id = ?', [id, req.barbearia_id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Barbeiro não encontrado ou não pertence a esta barbearia.' });
    res.json({ message: 'Barbeiro removido com sucesso.' });
  });
});

// ==============================
// ROTAS - AGENDA (PROTEGIDAS)
// ==============================

// Listar agendamentos APENAS da barbearia autenticada
app.get('/appointments', (req, res) => {
  // ALTERAÇÃO MULTI-TENANT: Adiciona cláusula WHERE
  db.all('SELECT * FROM appointments WHERE barbearia_id = ?', [req.barbearia_id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Criar agendamento PARA a barbearia autenticada
app.post('/appointments', (req, res) => {
  const { barber_id, cliente_nome, cliente_numero, data_hora } = req.body;
  if (!barber_id || !cliente_nome || !cliente_numero || !data_hora) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
  }
  const barbearia_id = req.barbearia_id;

  // ALTERAÇÃO MULTI-TENANT: A verificação de conflito agora também considera a barbearia
  db.get('SELECT * FROM appointments WHERE barber_id = ? AND data_hora = ? AND barbearia_id = ?', [barber_id, data_hora, barbearia_id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row) return res.status(409).json({ error: 'Horário já está ocupado para esse barbeiro.' });
    
    // ALTERAÇÃO MULTI-TENANT: Insere o barbearia_id
    db.run('INSERT INTO appointments (barber_id, cliente_nome, cliente_numero, data_hora, barbearia_id) VALUES (?, ?, ?, ?, ?)', [barber_id, cliente_nome, cliente_numero, data_hora, barbearia_id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ id: this.lastID, message: 'Agendamento criado com sucesso.' });
      }
    );
  });
});

// Atualizar um agendamento da barbearia autenticada
app.put('/appointments/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const { barber_id, cliente_nome, cliente_numero, data_hora, status, lembrete_enviado } = req.body;
    if (!data_hora) return res.status(400).json({ error: 'Data/hora obrigatória.' });

    // ALTERAÇÃO MULTI-TENANT: Adiciona o barbearia_id no WHERE
    db.run(
        `UPDATE appointments SET barber_id = ?, cliente_nome = ?, cliente_numero = ?, data_hora = ?, status = ?, lembrete_enviado = ? WHERE id = ? AND barbearia_id = ?`,
        [barber_id, cliente_nome, cliente_numero, data_hora, status || 'confirmado', lembrete_enviado ? 1 : 0, id, req.barbearia_id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: 'Agendamento não encontrado ou não pertence a esta barbearia.' });
            res.json({ message: 'Agendamento atualizado com sucesso.' });
        }
    );
});

// Remover um agendamento da barbearia autenticada
app.delete('/appointments/:id', (req, res) => {
    const id = parseInt(req.params.id);
    // ALTERAÇÃO MULTI-TENANT: Adiciona o barbearia_id no WHERE
    db.run('DELETE FROM appointments WHERE id = ? AND barbearia_id = ?', [id, req.barbearia_id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Agendamento não encontrado ou não pertence a esta barbearia.' });
        res.json({ message: 'Agendamento removido com sucesso.' });
    });
});

// ==============================
// ROTAS - CONFIGURAÇÕES (PROTEGIDAS)
// ==============================

// Buscar configurações APENAS da barbearia autenticada
app.get('/config', (req, res) => {
  // ALTERAÇÃO MULTI-TENANT: Rota e lógica modificadas
  db.all('SELECT chave, valor FROM config WHERE barbearia_id = ?', [req.barbearia_id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const config = {};
    rows.forEach(r => config[r.chave] = r.valor);
    res.json(config);
  });
});

// Criar ou atualizar uma configuração PARA a barbearia autenticada
app.post('/config', (req, res) => {
    // ALTERAÇÃO MULTI-TENANT: Rota e lógica modificadas
    const { chave, valor } = req.body;
    if (!chave) return res.status(400).json({ error: 'O campo "chave" é obrigatório.' });

    // REPLACE faz um INSERT ou, se a chave primária (barbearia_id, chave) já existir, faz um UPDATE.
    db.run('REPLACE INTO config (barbearia_id, chave, valor) VALUES (?, ?, ?)', [req.barbearia_id, chave, valor], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: `Configuração "${chave}" salva com sucesso.` });
    });
});

// ==============================
// INICIAR SERVIDOR
// ==============================
app.listen(port, () => {
  console.log(`🌐 Servidor rodando em http://localhost:${port}`);
});
