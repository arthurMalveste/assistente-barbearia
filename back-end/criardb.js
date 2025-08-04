const sqlite3 = require('sqlite3').verbose();
const dbPath = './db/barbearia.db';
const db = new sqlite3.Database(dbPath);
const { v4: uuidv4 } = require('uuid');

db.serialize(() => {
    console.log("✅ Criando estrutura de banco de dados multi-tenant...");

    db.run(`
        CREATE TABLE IF NOT EXISTS barbearias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome_barbearia TEXT NOT NULL,
            api_key TEXT UNIQUE NOT NULL,
            data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS barbers (
            id INTEGER PRIMARY KEY,
            nome TEXT NOT NULL,
            telefone TEXT,
            preferencias_horario TEXT,
            barbearia_id INTEGER,
            FOREIGN KEY (barbearia_id) REFERENCES barbearias(id) ON DELETE CASCADE
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            barber_id INTEGER,
            cliente_nome TEXT,
            cliente_numero TEXT,
            data_hora TEXT,
            status TEXT DEFAULT 'confirmado',
            lembrete_enviado BOOLEAN DEFAULT 0,
            barbearia_id INTEGER,
            FOREIGN KEY (barber_id) REFERENCES barbers (id) ON DELETE CASCADE,
            FOREIGN KEY (barbearia_id) REFERENCES barbearias (id) ON DELETE CASCADE
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS config (
            chave TEXT,
            valor TEXT,
            barbearia_id INTEGER,
            PRIMARY KEY (chave, barbearia_id),
            FOREIGN KEY (barbearia_id) REFERENCES barbearias (id) ON DELETE CASCADE
        )
    `);

    const firstBarberShopName = 'Barbearia Raiz';
    const firstApiKey = uuidv4();

    db.get("SELECT id FROM barbearias WHERE nome_barbearia = ?", [firstBarberShopName], (err, row) => {
        if (err) {
            console.error('❌ Erro ao verificar a primeira barbearia:', err);
            db.close();
            return;
        }

        if (row) {
            console.log(`✅ Barbearia '${firstBarberShopName}' já existe. API Key: ${row.api_key}`);
            db.close();
            return;
        }

        db.run("INSERT INTO barbearias (nome_barbearia, api_key) VALUES (?, ?)", [firstBarberShopName, firstApiKey], function (err) {
            if (err) {
                console.error('❌ Erro ao criar a primeira barbearia:', err);
                db.close();
                return;
            }

            const barbearia_id = this.lastID;
            console.log(`🎉 Primeira barbearia criada com sucesso! ID: ${barbearia_id}, API Key: ${firstApiKey}`);
            console.log("➡️ Associando dados existentes a este novo ID...");

            db.run("UPDATE barbers SET barbearia_id = ?", [barbearia_id], (err) => {
                if (err) console.error('❌ Erro ao atualizar tabela barbers:', err);
                db.run("UPDATE appointments SET barbearia_id = ?", [barbearia_id], (err) => {
                    if (err) console.error('❌ Erro ao atualizar tabela appointments:', err);
                    db.run("UPDATE config SET barbearia_id = ?", [barbearia_id], (err) => {
                        if (err) console.error('❌ Erro ao atualizar tabela config:', err);
                        console.log('✅ Dados existentes migrados com sucesso!');

                        db.run("INSERT OR REPLACE INTO config (chave, valor, barbearia_id) VALUES (?, ?, ?)",
                            ['descricao', 'Venha nos visitar! Cortamos e fazemos a barba com excelência. Agende seu horário!', barbearia_id],
                            (err) => {
                                if (err) console.error('❌ Erro ao inserir config:', err);
                                db.run("INSERT OR REPLACE INTO config (chave, valor, barbearia_id) VALUES (?, ?, ?)",
                                    ['endereco', 'Rua da Barbearia, 123, Centro, Cidade', barbearia_id],
                                    (err) => {
                                        if (err) console.error('❌ Erro ao inserir config:', err);
                                        // Fecha a conexão somente depois da última operação
                                        db.close();
                                    }
                                );
                            }
                        );
                    });
                });
            });
        });
    });
});