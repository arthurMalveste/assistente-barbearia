// criardb.js - BANCO MULTI-TENANT COM LOGIN SIMPLIFICADO POR BARBEARIA
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, 'db');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir);
}

const dbPath = path.join(dbDir, 'barbearia.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    console.log("🛠️ Iniciando criação do banco de dados...");

    // Barbearias com login
    db.run(`
        CREATE TABLE IF NOT EXISTS barbearias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome_barbearia TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            senha_hash TEXT NOT NULL,
            api_key TEXT NOT NULL UNIQUE,
            data_criacao TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS barbers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            telefone TEXT,
            barbearia_id INTEGER NOT NULL,
            criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
            ativo BOOLEAN DEFAULT 1,
            FOREIGN KEY (barbearia_id) REFERENCES barbearias(id) ON DELETE CASCADE
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            barber_id INTEGER,
            cliente_nome TEXT,
            cliente_numero TEXT,
            data_hora TEXT NOT NULL,
            status TEXT DEFAULT 'confirmado',
            lembrete_enviado BOOLEAN DEFAULT 0,
            barbearia_id INTEGER NOT NULL,
            criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
            ativo BOOLEAN DEFAULT 1,
            FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE CASCADE,
            FOREIGN KEY (barbearia_id) REFERENCES barbearias(id) ON DELETE CASCADE
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS config (
            barbearia_id INTEGER NOT NULL,
            chave TEXT NOT NULL,
            valor TEXT,
            criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (barbearia_id, chave),
            FOREIGN KEY (barbearia_id) REFERENCES barbearias(id) ON DELETE CASCADE
        )
    `);

    console.log("✅ Banco de dados criado com sucesso.");
});

db.close((err) => {
    if (err) return console.error('❌ Erro ao fechar o banco:', err.message);
    console.log("🔒 Banco de dados fechado.");
});
