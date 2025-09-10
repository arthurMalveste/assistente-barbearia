const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const masterDbPath = path.join(__dirname, 'db', 'master.db');
const db = new sqlite3.Database(masterDbPath);

(async () => {
    const nome = 'gabriel';
    const email = 'gabriel@gmail.com';
    const senha = 'barbearia'; // Troque para a senha desejada
    const barbeariaId = 2; // ID da barbearia vinculada a esse usuário

    try {
        const hash = await bcrypt.hash(senha, 10);

        db.run(`
            INSERT INTO usuarios (barbearia_id, nome, email, senha_hash)
            VALUES (?, ?, ?, ?)
        `, [barbeariaId, nome, email, hash], function(err) {
            if (err) {
                console.error('❌ Erro ao criar usuário:', err.message);
            } else {
                console.log(`✅ Usuário criado com sucesso! ID: ${this.lastID}`);
                console.log(`📧 Email: ${email}`);
                console.log(`🔑 Senha: ${senha}`);
            }
            db.close();
        });
    } catch (err) {
        console.error('Erro ao gerar hash da senha:', err);
        db.close();
    }
})();
