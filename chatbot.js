const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');

const client = new Client({
    authStrategy: new LocalAuth()
});

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('📌 Escaneie o QR Code para conectar.');
});

client.on('ready', () => {
    console.log('✅ Bot conectado com sucesso.');
});

client.on('message', async msg => {
    const from = msg.from;
    if (msg.body === '1') {
        await msg.reply('Digite no formato: Nome,ID_do_Barbeiro,DataHora(YYYY-MM-DD HH:mm)');
    } else if (msg.body.includes(',') && msg.body.split(',').length === 3) {
        const [nome, barber_id, data_hora] = msg.body.split(',');
        try {
            const res = await axios.post('http://localhost:3000/appointments', {
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
        await msg.reply('Envie:\n1 - Para agendar');

    }
});

client.initialize();
