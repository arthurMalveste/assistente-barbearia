const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const masterDbPath = path.join(__dirname, "db", "master.db");
const db = new sqlite3.Database(masterDbPath);

db.serialize(() => {
  db.run("DELETE FROM usuarios", (err) => {
    if (err) console.error("❌ Erro ao limpar usuarios:", err.message);
    else console.log("✅ Tabela usuarios limpa.");
  });

  db.run("DELETE FROM barbearias", (err) => {
    if (err) console.error("❌ Erro ao limpar barbearias:", err.message);
    else console.log("✅ Tabela barbearias limpa.");
  });

  db.run("DELETE FROM sqlite_sequence WHERE name='usuarios'", (err) => {
    if (err) console.error("❌ Erro ao resetar autoincremento de usuarios:", err.message);
    else console.log("✅ Autoincremento resetado para usuarios.");
  });

  db.run("DELETE FROM sqlite_sequence WHERE name='barbearias'", (err) => {
    if (err) console.error("❌ Erro ao resetar autoincremento de barbearias:", err.message);
    else console.log("✅ Autoincremento resetado para barbearias.");
  });
});

db.close(() => {
  console.log("🎉 master.db resetado com sucesso!");
});
