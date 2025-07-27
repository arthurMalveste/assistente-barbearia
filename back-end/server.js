const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const port = 3000;

app.use(cors());
app.use(bodyParser.json());

// ✅ Caminho correto para o banco na pasta "db"
const dbPath = path.join(__dirname, 'db', 'barbearia.db');

// Conectar ao banco
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Erro ao conectar ao banco:', err);
    } else {
        console.log(`✅ Banco conectado com sucesso: ${dbPath}`);
    }
});


// Criar novo barbeiro
app.post('/barbers', (req, res) => {
    const { nome } = req.body;
    if (!nome) {
        return res.status(400).json({ error: 'Nome do barbeiro é obrigatório.' });
    }

    db.run('INSERT INTO barbers (nome) VALUES (?)', [nome], function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ id: this.lastID, message: 'Barbeiro cadastrado com sucesso.' });
        }
    });
});

app.get('/barbers', (req, res) => {
  db.all('SELECT * FROM barbers', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});



// Listar agendamentos
app.get('/appointments', (req, res) => {
    db.all('SELECT * FROM appointments', [], (err, rows) => {
        if (err) res.status(500).json({ error: err.message });
        else res.json(rows);
    });
});

// Criar novo agendamento
app.post('/appointments', (req, res) => {
    const { barber_id, cliente_nome, cliente_numero, data_hora } = req.body;
    if (!barber_id || !cliente_nome || !cliente_numero || !data_hora) {
        return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
    }
    db.run(
        'INSERT INTO appointments (barber_id, cliente_nome, cliente_numero, data_hora) VALUES (?, ?, ?, ?)',
        [barber_id, cliente_nome, cliente_numero, data_hora],
        function (err) {
            if (err) res.status(500).json({ error: err.message });
            else res.json({ id: this.lastID, message: 'Agendamento criado com sucesso.' });
        }
    );
});

// Remarcar agendamento
app.put('/appointments/:id', (req, res) => {
    const { data_hora } = req.body;
    const id = req.params.id;
    if (!data_hora) return res.status(400).json({ error: 'Nova data/hora obrigatória.' });

    db.run(
        'UPDATE appointments SET data_hora = ? WHERE id = ?',
        [data_hora, id],
        function (err) {
            if (err) res.status(500).json({ error: err.message });
            else res.json({ message: 'Agendamento remarcado com sucesso.' });
        }
    );
});

// Cancelar agendamento
app.delete('/appointments/:id', (req, res) => {
    const id = req.params.id;
    db.run('DELETE FROM appointments WHERE id = ?', [id], function (err) {
        if (err) res.status(500).json({ error: err.message });
        else res.json({ message: 'Agendamento cancelado com sucesso.' });
    });
});
// Remover barbeiro
app.delete('/barbers/:id', (req, res) => {
    const id = req.params.id;

    db.run('DELETE FROM barbers WHERE id = ?', [id], function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Barbeiro não encontrado.' });
        }
        res.json({ message: 'Barbeiro removido com sucesso.' });
    });
});

// Iniciar servidor
app.listen(port, () => {
    console.log(`🌐 Servidor rodando em http://localhost:${port}`);
});
