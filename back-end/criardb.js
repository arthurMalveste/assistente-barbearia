const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Pega o nome da barbearia do primeiro argumento e a porta do segundo
const nomeDaBarbearia = process.argv[2];
const portaDoChatbot = process.argv[3];

if (!nomeDaBarbearia || !portaDoChatbot) {
    console.error('❌ Erro: Forneça o nome da barbearia e a porta do chatbot como argumentos.');
    console.log('Exemplo: node criardb.js "Barbearia Exemplo" 3008');
    return; // Encerra o script se os argumentos estiverem faltando
}

function createNewBarberShop(nomeBarbearia, port) {
    const dbFolder = path.join(__dirname, 'db');
    if (!fs.existsSync(dbFolder)) {
        fs.mkdirSync(dbFolder);
    }
    
    const masterDbPath = path.join(dbFolder, 'master.db');
    const dbsFolder = path.join(dbFolder, 'dbs');

    if (!fs.existsSync(dbsFolder)) {
        fs.mkdirSync(dbsFolder);
    }

    const masterDb = new sqlite3.Database(masterDbPath, (err) => {
        if (err) {
            console.error('❌ Erro ao conectar ao banco de dados mestre:', err.message);
            return;
        }
        console.log('✅ Conectado ao banco de dados mestre.');

        masterDb.serialize(() => {
            masterDb.run(`
                CREATE TABLE IF NOT EXISTS barbearias (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nome TEXT NOT NULL,
                    api_key TEXT UNIQUE NOT NULL,
                    db_path TEXT UNIQUE NOT NULL
                )
            `, (err) => {
                if (err) {
                    console.error('❌ Erro ao criar a tabela de barbearias:', err.message);
                    masterDb.close();
                    return;
                }
                console.log('✅ Tabela de barbearias verificada/criada.');

                const apiKey = uuidv4();
                const dbFileName = `barbearia_${apiKey}.db`;
                const dbPath = path.join(dbsFolder, dbFileName);

                const insertStmt = masterDb.prepare("INSERT INTO barbearias (nome, api_key, db_path) VALUES (?, ?, ?)");
                insertStmt.run(nomeBarbearia, apiKey, dbPath, function(err) {
                    if (err) {
                        console.error(`❌ Erro ao criar a barbearia '${nomeBarbearia}' no banco de dados mestre:`, err.message);
                        masterDb.close();
                        return;
                    }
                    console.log(`✅ Barbearia '${nomeBarbearia}' criada no banco mestre com ID: ${this.lastID}`);
                    console.log(`🔑 API Key gerada: ${apiKey}`);

                    const barberiaDb = new sqlite3.Database(dbPath, (err) => {
                        if (err) {
                            console.error('❌ Erro ao criar o banco de dados da barbearia:', err.message);
                            masterDb.close();
                            return;
                        }
                        console.log(`✅ Banco da barbearia '${nomeBarbearia}' criado em ${dbPath}`);

                        barberiaDb.serialize(() => {
                            barberiaDb.run(`CREATE TABLE IF NOT EXISTS barbers (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, telefone TEXT);`);
                            barberiaDb.run(`CREATE TABLE IF NOT EXISTS appointments (id INTEGER PRIMARY KEY AUTOINCREMENT, barber_id INTEGER, cliente_nome TEXT NOT NULL, cliente_numero TEXT, data_hora DATETIME NOT NULL, status TEXT NOT NULL DEFAULT 'agendado', lembrete_enviado BOOLEAN NOT NULL DEFAULT 0, FOREIGN KEY (barber_id) REFERENCES barbers(id));`);
                            barberiaDb.run(`CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT);`, (err) => {
                                barberiaDb.run(`CREATE TABLE IF NOT EXISTS horarios_barbearia (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dia_semana TEXT NOT NULL,
        horario_abertura TEXT NOT NULL,
        horario_fechamento TEXT NOT NULL,
        intervalo_minutos INTEGER DEFAULT 30
    );`);

    // Porta do chatbot na tabela config
    barberiaDb.run("INSERT INTO config (chave, valor) VALUES ('chatbot_port', ?)", [port]);
                                if (err) {
                                    console.error('❌ Erro ao criar tabela config:', err.message);
                                    // Mesmo com erro, tenta continuar para inserir os dados e fechar conexões
                                }

                                // INSERE A PORTA DO CHATBOT
                                const insertConfigStmt = barberiaDb.prepare("INSERT INTO config (chave, valor) VALUES ('chatbot_port', ?)");
                                insertConfigStmt.run(port, (insertErr) => {
                                    if (insertErr) {
                                        console.error('❌ Erro ao inserir a porta do chatbot na tabela config:', insertErr.message);
                                    } else {
                                        console.log(`✅ Porta do chatbot (${port}) configurada para '${nomeBarbearia}'.`);
                                        console.log(`✅ Tabelas criadas e configuradas para a barbearia '${nomeBarbearia}'.`);
                                    }
                                    insertConfigStmt.finalize();

                                    // Fecha as conexões
                                    barberiaDb.close((closeErr) => {
                                        if (closeErr) {
                                            console.error('❌ Erro ao fechar conexão do banco da barbearia:', closeErr.message);
                                        } else {
                                            console.log(`✅ Conexão do banco da barbearia '${nomeBarbearia}' fechada.`);
                                        }
                                        masterDb.close((masterCloseErr) => {
                                            if (masterCloseErr) {
                                                console.error('❌ Erro ao fechar conexão do banco mestre:', masterCloseErr.message);
                                            } else {
                                                console.log('✅ Conexão do banco mestre fechada.');
                                            }
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
                insertStmt.finalize();
            });
        });
    });
}

// Executa a função com os argumentos da linha de comando
createNewBarberShop(nomeDaBarbearia, portaDoChatbot);