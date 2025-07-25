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

    console.log("✅ Tabelas criadas com sucesso!");

    // Inserir barbeiros de exemplo
    db.run("INSERT INTO barbers (nome, telefone) VALUES ('João', '11999999999')");
    db.run("INSERT INTO barbers (nome, telefone) VALUES ('Guilherme', '11888888888')");
    db.run("INSERT INTO barbers (nome, telefone) VALUES ('Diego', '11777777777')");

    console.log("✅ Barbeiros de exemplo adicionados!");
});

db.close(() => {
    console.log("✅ Banco de dados fechado.");
});
