const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');

const client = new Client({
    authStrategy: new LocalAuth()
});
//gustavo alteraçoes
// Lista de palavras que ativam o bot
const gatilhos = ['oi bot', 'olá', 'menu', 'agendar', 'ola', 'bom dia', 'boa tarde' ,'boa noite','tudo bem','salve','oi','suave'];

// Usuários que ativaram o bot
const usuariosAtivos = new Set();
//gustavo alteraçoes
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('📌 Escaneie o QR Code para conectar.');
});

client.on('ready', () => {
    console.log('✅ Bot conectado com sucesso.');
});

client.on('message', async msg => {
    const from = msg.from;
    //gustavo alteraçoes
    const texto = msg.body.trim().toLowerCase();

    // Se a mensagem for uma palavra gatilho, ativa o bot para o usuário
    if (gatilhos.includes(texto)) {
        usuariosAtivos.add(from);
        await msg.reply('👋 Ola sou assistente virtual Envie:\n1 - 📅Para agendar\n2 - 💈Ver Serviços\n3 - 📌Localização');
        return;
    }

    // Se o usuário ainda não ativou o bot, ignorar mensagens
    if (!usuariosAtivos.has(from)) {
        return;
    }

    //gustavo alteraçoes
    // Fluxo do bot
    if (msg.body === '1') {
        await msg.reply('Digite no formato: Nome,ID_do_Barbeiro,DataHora(YYYY-MM-DD HH:mm)');
    } else if (msg.body.includes(',') && msg.body.split(',').length === 3) {
        const [nome, barber_id, data_hora] = msg.body.split(',');
        try {
            await axios.post('http://localhost:3000/appointments', {
                barber_id,
                cliente_nome: nome,
                cliente_numero: from.replace('@c.us', ''),
                data_hora
            });
            await msg.reply(`✅ Agendamento confirmado para ${data_hora}.`);
        } catch (err) {
            console.error(err);
            await msg.reply('❌ Erro ao criar agendamento.');
        }
    } else {
        await msg.reply('Envie:\n1 - Para agendar\n2 - Ver Serviços\n3 - Localização');
    }
});

client.initialize();
