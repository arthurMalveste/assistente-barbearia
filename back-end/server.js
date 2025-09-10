const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const SECRET = 'sua_chave_super_secreta_aqui';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());

const masterDbPath = path.join(__dirname, 'db', 'master.db');
const dbsFolder = path.join(__dirname, 'db', 'dbs');

// Garante pastas
if (!fs.existsSync(path.join(__dirname, 'db'))) {
    fs.mkdirSync(path.join(__dirname, 'db'));
}
if (!fs.existsSync(dbsFolder)) {
    fs.mkdirSync(dbsFolder);
}

// Conexão banco mestre
const masterDb = new sqlite3.Database(masterDbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
        console.error('❌ Erro ao conectar/criar o banco de dados mestre:', err.message);
        process.exit(1);
    } else {
        console.log('✅ Conectado ao banco de dados mestre.');
    }
});

// Cria tabela barbearias se não existir
masterDb.run(`
    CREATE TABLE IF NOT EXISTS barbearias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        api_key TEXT UNIQUE NOT NULL,
        db_path TEXT UNIQUE NOT NULL
    )
`);

// Cria tabela usuarios se não existir
masterDb.run(`
    CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        barbearia_id INTEGER NOT NULL,
        nome TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        senha_hash TEXT NOT NULL,
        FOREIGN KEY (barbearia_id) REFERENCES barbearias(id)
    )
`);

// -------------------
// Rota de Login
// -------------------
app.post('/login', (req, res) => {
    const { email, senha } = req.body;

    if (!email || !senha) {
        return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
    }

    masterDb.get(`
        SELECT u.id, u.nome, u.senha_hash, b.api_key, b.id AS barbearia_id
        FROM usuarios u
        JOIN barbearias b ON b.id = u.barbearia_id
        WHERE u.email = ?
    `, [email], async (err, row) => {
        if (err) return res.status(500).json({ error: 'Erro interno.' });
        if (!row) return res.status(401).json({ error: 'Credenciais inválidas.' });

        const senhaCorreta = await bcrypt.compare(senha, row.senha_hash);
        if (!senhaCorreta) {
            return res.status(401).json({ error: 'Credenciais inválidas.' });
        }

        const token = jwt.sign({ userId: row.id, barbeariaId: row.barbearia_id }, SECRET, { expiresIn: '8h' });

        res.json({
            token,
            apiKey: row.api_key,
            nome: row.nome,
            barbeariaId: row.barbearia_id
        });
    });
});

// -------------------
// Middleware autenticação por API Key
// -------------------
const authenticate = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
        return res.status(401).json({ error: 'Chave de API não fornecida.' });
    }

    masterDb.get('SELECT db_path FROM barbearias WHERE api_key = ?', [apiKey], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!row) {
            return res.status(403).json({ error: 'Chave de API inválida.' });
        }

        const dbPath = row.db_path;
        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (dbErr) => {
            if (dbErr) {
                console.error(`Erro ao conectar ao banco da barbearia: ${dbErr.message}`);
                return res.status(500).json({ error: 'Erro ao conectar ao banco de dados da barbearia.' });
            }
            req.db = db;
            req.apiKey = apiKey;
            next();
        });
    });
};

// Fecha conexão ao fim da resposta
app.use((req, res, next) => {
    res.on('finish', () => {
        if (req.db) {
            req.db.close((closeErr) => {
                if (closeErr) {
                    console.error('Erro ao fechar a conexão do banco de dados:', closeErr.message);
                }
            });
        }
    });
    next();
});

// -------------------
// Rota QRCode do Chatbot
// -------------------
app.get('/chatbot/qrcode', authenticate, async (req, res) => {
    const db = req.db;

    db.get('SELECT valor FROM config WHERE chave = ?', ['chatbot_port'], async (err, row) => {
        if (err || !row) {
            console.error('❌ Erro ao buscar porta do chatbot no banco de dados:', err);
            return res.status(500).json({ error: 'Porta do chatbot não configurada.' });
        }
        const chatbotPort = row.valor;

        try {
            const response = await axios.get(`http://localhost:${chatbotPort}/qrcode`);
            res.json(response.data);
        } catch (err) {
            res.status(500).json({ error: 'Erro ao buscar o QR code do bot.' });
        }
    });
});

// -------------------
// Rotas de Config
// -------------------
app.get('/config', authenticate, (req, res) => {
    req.db.all('SELECT chave, valor FROM config', (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        const config = {};
        rows.forEach(row => {
            config[row.chave] = row.valor;
        });
        res.json(config);
    });
});

app.get('/chatbot/configuracoes', authenticate, (req, res) => {
    req.db.all('SELECT chave, valor FROM config', [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        const configuracoes = rows.reduce((acc, row) => {
            acc[row.chave] = row.valor;
            return acc;
        }, {});
        res.json(configuracoes);
    });
});

// ✅ NOVA ROTA: Salvar/atualizar configuração
app.post('/config', authenticate, (req, res) => {
    const { chave, valor } = req.body;
    if (!chave) {
        return res.status(400).json({ error: 'Chave é obrigatória.' });
    }

    req.db.run(
        `INSERT INTO config (chave, valor) VALUES (?, ?)
         ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`,
        [chave, valor],
        function (err) {
            if (err) {
                console.error('❌ Erro ao salvar config:', err.message);
                return res.status(500).json({ error: err.message });
            }
            res.json({ message: `Configuração '${chave}' salva com sucesso.` });
        }
    );
});
// ✅ Nova rota: buscar configuração por chave
app.get('/config/:chave', authenticate, (req, res) => {
    const { chave } = req.params;
    req.db.get('SELECT valor FROM config WHERE chave = ?', [chave], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!row) {
            return res.status(404).json({ error: 'Configuração não encontrada.' });
        }
        res.json({ valor: row.valor });
    });
});


// -------------------
// Rotas Administração (ATUALIZADA)
// -------------------
app.post('/barbearias', (req, res) => {
    const { nome, chatbot_port } = req.body; // ATUALIZADO: Recebe a porta
    if (!nome || !chatbot_port) { // ATUALIZADO: Valida a porta
        return res.status(400).json({ error: 'O nome da barbearia e a chatbot_port são obrigatórios.' });
    }

    const apiKey = uuidv4();
    const dbFileName = `barbearia_${apiKey}.db`;
    const dbPath = path.join(dbsFolder, dbFileName);

    masterDb.run('INSERT INTO barbearias (nome, api_key, db_path) VALUES (?, ?, ?)', [nome, apiKey, dbPath], function (err) {
        if (err) {
            console.error('Erro ao inserir barbearia no mestre:', err.message);
            return res.status(500).json({ error: 'Erro ao criar a barbearia.' });
        }

        const lastID = this.lastID;
        const barberiaDb = new sqlite3.Database(dbPath, (dbErr) => {
            if (dbErr) {
                console.error('Erro ao criar o DB da barbearia:', dbErr.message);
                return res.status(500).json({ error: 'Erro ao criar o DB da barbearia.' });
            }

            barberiaDb.serialize(() => {
    barberiaDb.run(`
        CREATE TABLE IF NOT EXISTS barbers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            telefone TEXT
        )
    `);

    barberiaDb.run(`
        CREATE TABLE IF NOT EXISTS appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            barber_id INTEGER,
            cliente_nome TEXT NOT NULL,
            cliente_numero TEXT,
            data_hora DATETIME NOT NULL,
            status TEXT NOT NULL DEFAULT 'agendado',
            lembrete_enviado BOOLEAN NOT NULL DEFAULT 0,
            FOREIGN KEY (barber_id) REFERENCES barbers(id)
        )
    `);

    barberiaDb.run(`
        CREATE TABLE IF NOT EXISTS config (
            chave TEXT PRIMARY KEY,
            valor TEXT
        )
    `);

    barberiaDb.run(`
        CREATE TABLE IF NOT EXISTS horarios_barbearia (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dia_semana TEXT NOT NULL,
            horario_abertura TEXT NOT NULL,
            horario_fechamento TEXT NOT NULL,
            intervalo_minutos INTEGER NOT NULL
        )
    `);

    // salva a porta do chatbot
    barberiaDb.run(
        `INSERT INTO config (chave, valor) VALUES ('chatbot_port', ?)`,
        [chatbot_port]
    );
});

            
            
            barberiaDb.close((closeErr) => {
                if(closeErr) {
                    console.error("Erro ao fechar DB da barbearia:", closeErr.message);
                }
            });

            res.status(201).json({ id: lastID, nome, apiKey, dbPath, chatbot_port });
        });
    });
});


// -------------------
// Rotas Barbeiros
// -------------------
app.post('/barbers', authenticate, (req, res) => {
    const { nome, telefone } = req.body;
    if (!nome) {
        return res.status(400).json({ error: 'Nome do barbeiro é obrigatório.' });
    }
    req.db.run('INSERT INTO barbers (nome, telefone) VALUES (?, ?)', [nome, telefone], function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ id: this.lastID, nome, telefone });
    });
});

app.get('/barbers', authenticate, (req, res) => {
    req.db.all('SELECT id, nome, telefone FROM barbers', [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// -------------------
// Rotas Agendamentos
// -------------------
app.post('/appointments', authenticate, (req, res) => {
    const { barber_id, cliente_nome, cliente_numero, data_hora } = req.body;
    if (!barber_id || !cliente_nome || !data_hora) {
        return res.status(400).json({ error: 'Barbeiro, nome do cliente e data/hora são obrigatórios.' });
    }
    req.db.run('INSERT INTO appointments (barber_id, cliente_nome, cliente_numero, data_hora) VALUES (?, ?, ?, ?)',
        [barber_id, cliente_nome, cliente_numero, data_hora], function (err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.status(201).json({ id: this.lastID, ...req.body });
        });
});

app.get('/appointments', authenticate, (req, res) => {
    req.db.all('SELECT * FROM appointments', [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});
// Busca os horários da barbearia
app.get('/horarios', authenticate, (req, res) => {
    req.db.all('SELECT * FROM horarios_barbearia', [], (err, rows) => {
        if (err) {
            console.error('❌ Erro ao buscar horários:', err.message);
            return res.status(500).json({ error: 'Erro ao buscar horários.' });
        }
        res.json(rows);
    });
});

app.put('/appointments/:id', authenticate, (req, res) => {
    const { barber_id, cliente_nome, cliente_numero, data_hora, status, lembrete_enviado } = req.body;
    if (!barber_id || !cliente_nome || !data_hora || !status) {
        return res.status(400).json({ error: 'Campos essenciais são obrigatórios.' });
    }
    req.db.run(
        `UPDATE appointments 
         SET barber_id = ?, cliente_nome = ?, cliente_numero = ?, data_hora = ?, status = ?, lembrete_enviado = ? 
         WHERE id = ?`,
        [barber_id, cliente_nome, cliente_numero, data_hora, status, lembrete_enviado, req.params.id],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ message: 'Agendamento não encontrado.' });
            res.json({ message: 'Agendamento atualizado com sucesso.' });
        }
    );
});

app.delete('/appointments/:id', authenticate, (req, res) => {
    req.db.run('DELETE FROM appointments WHERE id = ?', [req.params.id], function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) return res.status(404).json({ message: 'Agendamento não encontrado.' });
        res.json({ message: 'Agendamento cancelado com sucesso.' });
    });
});
// =============================
// UTIL: mapear dia da semana
// =============================
function diaSemanaPT(dateStr) {
  // dateStr no formato 'YYYY-MM-DD'
  const d = new Date(dateStr + 'T00:00:00');
  const dias = ['domingo','segunda','terca','quarta','quinta','sexta','sabado'];
  return dias[d.getDay()];
}

// =============================
// ROTAS: Horários por barbearia
// =============================

// Listar todos os horários configurados
app.get('/horarios', authenticate, (req, res) => {
  req.db.all('SELECT * FROM horarios_barbearia ORDER BY id', [], (err, rows) => {
    if (err) {
      console.error('❌ Erro ao buscar horários:', err.message);
      return res.status(500).json({ error: 'Erro ao buscar horários.' });
    }
    res.json(rows);
  });
});

// Salvar/atualizar todos os horários de uma vez
app.post('/horarios', authenticate, (req, res) => {
  const { horarios } = req.body;
  if (!Array.isArray(horarios)) {
    return res.status(400).json({ error: 'Formato de horários inválido.' });
  }

  req.db.serialize(() => {
    req.db.run('BEGIN TRANSACTION');
    req.db.run('DELETE FROM horarios_barbearia');

    const stmt = req.db.prepare(`
      INSERT INTO horarios_barbearia
      (dia_semana, horario_abertura, horario_fechamento, intervalo_minutos)
      VALUES (?, ?, ?, ?)
    `);

    for (const h of horarios) {
      if (!h || !h.dia_semana || !h.horario_abertura || !h.horario_fechamento) continue;
      stmt.run(
        (h.dia_semana || '').toLowerCase(), // 'segunda'...'domingo'
        h.horario_abertura,
        h.horario_fechamento,
        Number(h.intervalo_minutos) > 0 ? Number(h.intervalo_minutos) : 30
      );
    }

    stmt.finalize((e) => {
      if (e) {
        console.error('❌ Erro ao salvar horários:', e.message);
        req.db.run('ROLLBACK');
        return res.status(500).json({ error: 'Erro ao salvar horários.' });
      }
      req.db.run('COMMIT');
      res.json({ message: '✅ Horários configurados com sucesso!' });
    });
  });
});

// Gerar horários disponíveis (considera agendamentos e "agora")
app.get('/horarios/disponiveis', authenticate, (req, res) => {
  const { date, barber_id } = req.query; // date = 'YYYY-MM-DD'
  if (!date) return res.status(400).json({ error: 'Parâmetro "date" é obrigatório (YYYY-MM-DD).' });

  const dia = diaSemanaPT(date); // 'segunda'...'domingo'

  req.db.get(
    `SELECT horario_abertura, horario_fechamento, intervalo_minutos
       FROM horarios_barbearia
      WHERE dia_semana = ?`,
    [dia],
    (err, horario) => {
      if (err) {
        console.error('❌ Erro ao buscar configuração de horários:', err.message);
        return res.status(500).json({ error: 'Erro ao buscar horários.' });
      }
      if (!horario) {
        return res.json({ slots: [], message: 'Barbearia fechada neste dia.' });
      }

      // Gera todos os slots entre abertura e fechamento
      const slots = [];
      const [sh, sm] = horario.horario_abertura.split(':').map(Number);
      const [eh, em] = horario.horario_fechamento.split(':').map(Number);
      const step = Number(horario.intervalo_minutos) || 30;

      // Data base
      const start = new Date(date + 'T' + horario.horario_abertura + ':00');
      const end = new Date(date + 'T' + horario.horario_fechamento + ':00');

      for (let t = new Date(start); t < end; t = new Date(t.getTime() + step * 60000)) {
        const hh = String(t.getHours()).padStart(2,'0');
        const mm = String(t.getMinutes()).padStart(2,'0');
        slots.push(`${hh}:${mm}`);
      }

      // Remover slots já ocupados (do barbeiro, se informado) e horários no passado
      const agora = new Date();

      const sqlOcc =
        barber_id
          ? `SELECT substr(data_hora, 12, 5) as hhmm FROM appointments WHERE date(data_hora)=? AND barber_id=?`
          : `SELECT substr(data_hora, 12, 5) as hhmm FROM appointments WHERE date(data_hora)=?`;

      const params = barber_id ? [date, barber_id] : [date];

      req.db.all(sqlOcc, params, (e2, rowsOcc) => {
        if (e2) {
          console.error('❌ Erro ao buscar agendamentos do dia:', e2.message);
          return res.status(500).json({ error: 'Erro ao verificar agendamentos.' });
        }
        const ocupados = new Set(rowsOcc.map(r => r.hhmm));

        const livres = slots.filter(hhmm => {
          if (ocupados.has(hhmm)) return false;
          const slotDate = new Date(`${date}T${hhmm}:00`);
          return slotDate > agora; // não mostra horários já passados
        });

        res.json({ slots: livres });
      });
    }
  );
});


app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});