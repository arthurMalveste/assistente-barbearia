const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const dbFolder = path.join(__dirname, "db");
const masterDbPath = path.join(dbFolder, "master.db");

const arg = process.argv[2]; // ID ou nome da barbearia

if (!arg) {
  console.error("❌ Erro: Informe o ID ou nome da barbearia.");
  console.log("Exemplo: node deletarBarbearia.js 3");
  console.log('Exemplo: node deletarBarbearia.js "Barbearia Teste"');
  process.exit(1);
}

const masterDb = new sqlite3.Database(masterDbPath, (err) => {
  if (err) {
    console.error("❌ Erro ao conectar ao banco mestre:", err.message);
    process.exit(1);
  }
});

function deletarBarbearia(valor) {
  let sql;
  let params;

  if (/^\d+$/.test(valor)) {
    sql = "SELECT * FROM barbearias WHERE id = ?";
    params = [valor];
  } else {
    sql = "SELECT * FROM barbearias WHERE nome = ?";
    params = [valor];
  }

  masterDb.get(sql, params, (err, row) => {
    if (err) {
      console.error("❌ Erro ao buscar barbearia:", err.message);
      masterDb.close();
      return;
    }

    if (!row) {
      console.error("❌ Barbearia não encontrada.");
      masterDb.close();
      return;
    }

    console.log(`🔍 Encontrada: ID=${row.id}, Nome=${row.nome}, DB=${row.db_path}`);

    // Primeiro, deletar os usuários vinculados
    masterDb.run("DELETE FROM usuarios WHERE barbearia_id = ?", [row.id], function (err) {
      if (err) {
        console.error("❌ Erro ao deletar usuários:", err.message);
      } else {
        console.log(`✅ ${this.changes} usuário(s) removido(s) da barbearia ${row.nome}.`);
      }

      // Agora, deletar a barbearia em si
      masterDb.run("DELETE FROM barbearias WHERE id = ?", [row.id], function (err) {
        if (err) {
          console.error("❌ Erro ao deletar barbearia do mestre:", err.message);
        } else {
          console.log("✅ Barbearia removida do banco mestre.");
        }

        // Apaga arquivo .db da barbearia
        if (fs.existsSync(row.db_path)) {
          fs.unlinkSync(row.db_path);
          console.log(`✅ Banco de dados ${row.db_path} deletado.`);
        } else {
          console.log("⚠️ Arquivo do banco não encontrado.");
        }

        masterDb.close(() => {
          console.log("✅ Conexão fechada.");
          console.log("⚠️ Se a barbearia tinha um processo no PM2, remova manualmente com:");
          console.log(`pm2 delete "barbearia ${row.nome.toLowerCase()}"`);
        });
      });
    });
  });
}

deletarBarbearia(arg);
