const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./barbearia.db');

db.serialize(() => {
    console.log("✅ Recriando tabelas...");

    // ⚠️ Dropa a tabela barbers para recriar sem AUTOINCREMENT
    db.run(`DROP TABLE IF EXISTS barbers`);

    // ✅ Tabela de barbeiros sem AUTOINCREMENT
    db.run(`
        CREATE TABLE IF NOT EXISTS barbers (
            id INTEGER PRIMARY KEY,
            nome TEXT NOT NULL,
            telefone TEXT,
            preferencias_horario TEXT
        )
    `);

    // Tabela de agendamentos
    db.run(`
        CREATE TABLE IF NOT EXISTS appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            barber_id INTEGER,
            cliente_nome TEXT,
            cliente_numero TEXT,
            data_hora TEXT,
            status TEXT DEFAULT 'confirmado',
            FOREIGN KEY (barber_id) REFERENCES barbers (id)
        )
    `);

    // Tabela de configurações institucionais
    db.run(`
        CREATE TABLE IF NOT EXISTS config (
            chave TEXT PRIMARY KEY,
            valor TEXT
        )
    `);

    db.serialize(() => {
    db.run("INSERT OR REPLACE INTO config (chave, valor) VALUES ('descricao', '💈 Tabela de valores:\n- Corte: R$30\n- Barba: R$20\n- Sobrancelha: R$10')");
    db.run("INSERT OR REPLACE INTO config (chave, valor) VALUES ('endereco', '📌 Estamos na Rua Fictícia, 123 - Centro')");
});

    // Inserir barbeiros de exemplo (com IDs explícitos se quiser controlar)
    db.run("INSERT INTO barbers (id, nome, telefone) VALUES (1, 'João', '11999999999')");
    db.run("INSERT INTO barbers (id, nome, telefone) VALUES (2, 'Guilherme', '11888888888')");
    db.run("INSERT INTO barbers (id, nome, telefone) VALUES (3, 'Diego', '11777777777')");

    console.log("✅ Banco de dados configurado com sucesso!");
});

db.close(() => {
    console.log("✅ Banco de dados fechado.");
});
