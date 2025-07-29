const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Caminho absoluto para o banco
const dbPath = path.resolve(__dirname, '../db/barbearia.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run(`ALTER TABLE appointments ADD COLUMN lembrete_enviado BOOLEAN DEFAULT 0`, (err) => {
        if (err) {
            if (err.message.includes("duplicate column name")) {
                console.log("⚠️ A coluna 'lembrete_enviado' já existe.");
            } else {
                console.error("❌ Erro ao adicionar coluna:", err.message);
            }
        } else {
            console.log("✅ Coluna 'lembrete_enviado' adicionada com sucesso.");
        }
    });
});

db.close();
