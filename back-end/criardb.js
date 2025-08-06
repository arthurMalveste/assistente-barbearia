// criardb.js - VERSÃO MULTI-TENANT
const sqlite3 = require('sqlite3').verbose();
// Alterado para colocar o DB em uma pasta 'db' para organização
const db = new sqlite3.Database('./db/barbearia.db');

db.serialize(() => {
    console.log("✅ Iniciando criação do schema multi-tenant...");

    // Tabela principal que define os "inquilinos" (tenants)
    db.run(`
        CREATE TABLE IF NOT EXISTS barbearias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome_barbearia TEXT NOT NULL,
            api_key TEXT NOT NULL UNIQUE, -- Chave de autenticação única para cada barbearia
            data_criacao TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Tabela de barbeiros, agora com referência à barbearia
    db.run(`
        CREATE TABLE IF NOT EXISTS barbers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            telefone TEXT,
            barbearia_id INTEGER NOT NULL,
            FOREIGN KEY (barbearia_id) REFERENCES barbearias (id) ON DELETE CASCADE
        )
    `);

    // Tabela de agendamentos, também com referência à barbearia
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
            FOREIGN KEY (barber_id) REFERENCES barbers (id),
            FOREIGN KEY (barbearia_id) REFERENCES barbearias (id) ON DELETE CASCADE
        )
    `);

    // Tabela de configurações, agora com chave composta para permitir configs por barbearia
    db.run(`
        CREATE TABLE IF NOT EXISTS config (
            barbearia_id INTEGER NOT NULL,
            chave TEXT NOT NULL,
            valor TEXT,
            PRIMARY KEY (barbearia_id, chave),
            FOREIGN KEY (barbearia_id) REFERENCES barbearias (id) ON DELETE CASCADE
        )
    `);

    console.log("✅ Schema multi-tenant criado com sucesso!");
});

db.close(() => {
    console.log("✅ Conexão com o banco de dados fechada.");
});