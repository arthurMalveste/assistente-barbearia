// script-get-key.js
const axios = require('axios');

// Nome da barbearia que você quer criar
const nomeBarbearia = "Barbearia Cliente 2";

async function createBarbeariaAndGetApiKey() {
    try {
        console.log(`🚀 Tentando criar a barbearia: "${nomeBarbearia}"...`);
        const response = await axios.post('http://localhost:3000/barbearias', {
            nome_barbearia: nomeBarbearia
        });

        const { id, api_key } = response.data;

        console.log('\n✅ Barbearia criada com sucesso!');
        console.log(` - ID: ${id}`);
        console.log(` - Nome: ${nomeBarbearia}`);
        console.log(` - API Key gerada: ${api_key}\n`);
        console.log(`⚠️ Agora, copie a chave acima e cole-a no seu arquivo ecosystem.config.js.`);

    } catch (error) {
        if (error.response) {
            console.error('❌ Erro da API:', error.response.data);
        } else {
            console.error('❌ Erro inesperado:', error.message);
        }
    }
}

createBarbeariaAndGetApiKey();
