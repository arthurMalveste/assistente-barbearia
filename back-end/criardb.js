// criardb.js - VERSÃO REESTRUTURADA PARA MULTI-TENANCY
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Garante que o diretório do banco de dados exista
const dbDir = path.join(__dirname, 'db');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir);
}

const dbPath = path.join(dbDir, 'barbearia.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    console.log("✅ Iniciando criação do schema multi-tenant...");

    // Tabela principal que define os "inquilinos" (tenants)
    db.run(`
        CREATE TABLE IF NOT EXISTS barbearias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome_barbearia TEXT NOT NULL,
            api_key TEXT NOT NULL UNIQUE,
            data_criacao TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Tabela de barbeiros, agora com a coluna de relacionamento 'barbearia_id'
    db.run(`
        CREATE TABLE IF NOT EXISTS barbers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            telefone TEXT,
            barbearia_id INTEGER NOT NULL,
            FOREIGN KEY (barbearia_id) REFERENCES barbearias (id) ON DELETE CASCADE
        )
    `);

    // Tabela de agendamentos, também com 'barbearia_id'
    db.run(`
        CREATE TABLE IF NOT EXISTS appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            barber_id INTEGER,
            cliente_nome TEXT,
            cliente_numero TEXT,
            data_hora TEXT NOT NULL,
            barbearia_id INTEGER NOT NULL,
            status TEXT DEFAULT 'confirmado',
            lembrete_enviado BOOLEAN DEFAULT 0,
            FOREIGN KEY (barber_id) REFERENCES barbers (id) ON DELETE CASCADE,
            FOREIGN KEY (barbearia_id) REFERENCES barbearias (id) ON DELETE CASCADE
        )
    `);

    // Tabela de configurações, agora com chave primária composta para permitir configs por barbearia
    db.run(`
        CREATE TABLE IF NOT EXISTS config (
            barbearia_id INTEGER NOT NULL,
            chave TEXT NOT NULL,
            valor TEXT,
            PRIMARY KEY (barbearia_id, chave),
            FOREIGN KEY (barbearia_id) REFERENCES barbearias (id) ON DELETE CASCADE
        )
    `);
    
    // Tabela de sequência do SQLite, não precisa ser criada manualmente.

    console.log("✅ Schema multi-tenant criado com sucesso!");
});

db.close((err) => {
    if (err) {
        return console.error('❌ Erro ao fechar o banco de dados:', err.message);
    }
    console.log("✅ Conexão com o banco de dados fechada.");
});