const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./barbearia.db');

db.serialize(() => {
    console.log("✅ Criando tabelas...");

    // Tabela de barbeiros
    db.run(`
        CREATE TABLE IF NOT EXISTS barbers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
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

    // Inserir configurações padrão
    db.run("INSERT OR IGNORE INTO config (chave, valor) VALUES ('descricao', '💈 Conheça - nos:\\n- Barbearia fundada em 1900, a melhor da cidade')");
    db.run("INSERT OR IGNORE INTO config (chave, valor) VALUES ('endereco', '📌 Estamos na Rua 1, 123 - Centro.')");

    // Inserir barbeiros de exemplo
    db.run("INSERT INTO barbers (nome, telefone) VALUES ('João', '11999999999')");
    db.run("INSERT INTO barbers (nome, telefone) VALUES ('Guilherme', '11888888888')");
    db.run("INSERT INTO barbers (nome, telefone) VALUES ('Diego', '11777777777')");

    console.log("✅ Banco de dados configurado com sucesso!");
});

db.close(() => {
    console.log("✅ Banco de dados fechado.");
});
