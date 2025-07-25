const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./barbearia.db');

db.serialize(() => {
    // Exemplos de barbeiros
    db.run("INSERT INTO barbers (nome, telefone) VALUES ('Rogério', '11333338888')");
    db.run("INSERT INTO barbers (nome, telefone) VALUES ('Marcelo', '11444873777')");
});

db.close(() => {
    console.log("✅ Barbeiros adicionados com sucesso!");
});