const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbsFolder = path.join(__dirname, 'db', 'dbs');
const files = fs.readdirSync(dbsFolder).filter(f => f.endsWith('.db'));

const sql = `
CREATE TABLE IF NOT EXISTS horarios_barbearia (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dia_semana TEXT NOT NULL,
  horario_abertura TEXT NOT NULL,
  horario_fechamento TEXT NOT NULL,
  intervalo_minutos INTEGER NOT NULL DEFAULT 30
);
`;

(async () => {
  for (const f of files) {
    const full = path.join(dbsFolder, f);
    await new Promise((resolve) => {
      const db = new sqlite3.Database(full);
      db.run(sql, [], (err) => {
        if (err) console.error(`❌ Erro no banco ${f}:`, err.message);
        else console.log(`✅ Migrado: ${f}`);
        db.close(resolve);
      });
    });
  }
})();
