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

// Middleware de Autenticação - O Guardião
const authenticate = async (req, res, next) => {
    const apiKey = req.header('X-API-Key');

    if (!apiKey) {
        return res.status(401).json({ error: 'Acesso negado. Chave de API não fornecida.' });
    }

    db.get('SELECT id FROM barbearias WHERE api_key = ?', [apiKey], (err, row) => {
        if (err) {
            console.error('❌ Erro no banco de dados durante a autenticação:', err);
            return res.status(500).json({ error: 'Erro interno do servidor.' });
        }

        if (!row) {
            return res.status(403).json({ error: 'Acesso negado. Chave de API inválida.' });
        }

        req.barbearia_id = row.id; // Anexa o ID da barbearia à requisição
        next();
    });
};

// Rotas de gerenciamento de barbearias (acesso restrito)
app.post('/barbearias', async (req, res) => {
    const { nome_barbearia } = req.body;
    if (!nome_barbearia) {
        return res.status(400).json({ error: 'Nome da barbearia é obrigatório.' });
    }
    const apiKey = uuidv4();

    db.run('INSERT INTO barbearias (nome_barbearia, api_key) VALUES (?, ?)', [nome_barbearia, apiKey], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ id: this.lastID, nome_barbearia: nome_barbearia, api_key: apiKey, message: 'Barbearia criada com sucesso.' });
    });
});

// ==============================
// ROTAS - APLICADAS AO MULTI-TENANT
// ==============================
// Aplica o middleware de autenticação a todas as rotas abaixo
app.use(authenticate);

// --- ROTAS DE BARBEIROS ---

// Rota para adicionar um novo barbeiro
app.post('/barbers', (req, res) => {
    const { nome, telefone } = req.body;
    const barbearia_id = req.barbearia_id;
    if (!nome) {
        return res.status(400).json({ error: 'Nome do barbeiro é obrigatório.' });
    }

    // Simplificação: Deixar o banco de dados gerenciar o ID automaticamente.
    // Removido a função findLowestAvailableBarberId
    const sql = 'INSERT INTO barbers (nome, telefone, barbearia_id) VALUES (?, ?, ?)';
    db.run(sql, [nome, telefone, barbearia_id], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        // Usar this.lastID para obter o ID gerado pelo banco de dados
        res.status(201).json({ id: this.lastID, nome, telefone, barbearia_id });
    });
});

// Rota para listar barbeiros de uma barbearia específica
app.get('/barbers', (req, res) => {
  const barbearia_id = req.barbearia_id;
  db.all('SELECT id, nome, telefone FROM barbers WHERE barbearia_id = ? ORDER BY id ASC', [barbearia_id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Rota para obter um barbeiro por ID
app.get('/barbers/:id', (req, res) => {
    const { id } = req.params;
    const barbearia_id = req.barbearia_id;
    db.get('SELECT id, nome, telefone FROM barbers WHERE id = ? AND barbearia_id = ?', [id, barbearia_id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Barbeiro não encontrado.' });
        res.json(row);
    });
});

// Rota para atualizar um barbeiro
// Rota para atualizar um barbeiro
app.put('/barbers/:id', (req, res) => {
    // 1. Converter o ID da URL (string) para um número inteiro.
    const id = parseInt(req.params.id, 10);

    // 2. Adicionar uma verificação para garantir que o ID é um número válido.
    if (isNaN(id)) {
        return res.status(400).json({ error: 'ID do barbeiro inválido.' });
    }

    const { nome, telefone } = req.body;
    const barbearia_id = req.barbearia_id;
    if (!nome && !telefone) {
        return res.status(400).json({ error: 'Pelo menos o nome ou o telefone deve ser fornecido.' });
    }

    // A query agora receberá o 'id' como um número, funcionando corretamente.
    db.run('UPDATE barbers SET nome = COALESCE(?, nome), telefone = COALESCE(?, telefone) WHERE id = ? AND barbearia_id = ?', [nome, telefone, id, barbearia_id], function(err) {
        if (err) {
            console.error('Erro ao atualizar barbeiro no DB:', err);
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Barbeiro não encontrado ou não pertence a esta barbearia.' });
        }
        res.json({ message: 'Barbeiro atualizado com sucesso.', changes: this.changes });
    });
});
// server.js - ROTA CORRIGIDA
app.delete('/barbers/:id', (req, res) => {
    const id = parseInt(req.params.id, 10); // CONVERTE PARA NÚMERO
    if (isNaN(id)) {
        return res.status(400).json({ error: 'ID do barbeiro inválido.' });
    }

    const barbearia_id = req.barbearia_id;
    db.run('DELETE FROM barbers WHERE id = ? AND barbearia_id = ?', [id, barbearia_id], function(err) {
        if (err) {
            console.error('Erro ao excluir barbeiro no DB:', err);
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Barbeiro não encontrado ou não pertence a esta barbearia.' });
        }
        res.json({ message: 'Barbeiro excluído com sucesso.', changes: this.changes });
    });
});

// --- ROTAS DE CONFIGURAÇÃO ---
app.post('/config', (req, res) => {
    const { chave, valor } = req.body;
    const barbearia_id = req.barbearia_id;
    if (!chave || !valor) {
        return res.status(400).json({ error: 'Chave e valor são obrigatórios.' });
    }

    db.run('INSERT OR REPLACE INTO config (chave, valor, barbearia_id) VALUES (?, ?, ?)', [chave, valor, barbearia_id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: `Configuração para '${chave}' salva com sucesso.` });
    });
});

app.get('/config', (req, res) => {
  const barbearia_id = req.barbearia_id;
  db.all('SELECT chave, valor FROM config WHERE barbearia_id = ?', [barbearia_id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const config = rows.reduce((acc, curr) => {
        acc[curr.chave] = curr.valor;
        return acc;
    }, {});
    res.json(config);
  });
});

app.get('/config/:chave', (req, res) => {
    const chave = req.params.chave;
    const barbearia_id = req.barbearia_id;
    db.get('SELECT valor FROM config WHERE chave = ? AND barbearia_id = ?', [chave, barbearia_id], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!row) {
            return res.status(404).json({ error: 'Configuração não encontrada.' });
        }
        res.json(row);
    });
});

// --- ROTAS DE AGENDAMENTOS ---
// A rota POST para agendamentos foi movida para depois do middleware de autenticação
app.post('/appointments', (req, res) => {
    const { barber_id, cliente_nome, cliente_numero, data_hora, status, lembrete_enviado } = req.body;
    const barbearia_id = req.barbearia_id;
    if (!barber_id || !cliente_nome || !cliente_numero || !data_hora) {
        return res.status(400).json({ error: 'Todos os campos são obrigatórios: barber_id, cliente_nome, cliente_numero, data_hora.' });
    }

    const sql = 'INSERT INTO appointments (barber_id, cliente_nome, cliente_numero, data_hora, status, lembrete_enviado, barbearia_id) VALUES (?, ?, ?, ?, ?, ?, ?)';
    db.run(sql, [barber_id, cliente_nome, cliente_numero, data_hora, status, lembrete_enviado, barbearia_id], function(err) {
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
    db.run('DELETE FROM appointments WHERE id = ? AND barbearia_id = ?', [id, barbearia_id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Agendamento não encontrado.' });
        res.json({ message: 'Agendamento excluído com sucesso.', changes: this.changes });
    });
});

app.listen(port, () => {
  console.log(`🚀 Servidor rodando na porta ${port}`);
});
