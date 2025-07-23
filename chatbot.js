const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');

const client = new Client({
    authStrategy: new LocalAuth()
});

// Lista de palavras que ativam o bot
const gatilhos = ['oi bot', 'olá', 'menu', 'agendar', 'ola', 'bom dia', 'boa tarde' ,'boa noite','tudo bem','salve','oi','suave'];

// Usuários que ativaram o bot
const usuariosAtivos = new Set();

// Estado do fluxo para cada usuário
// 0 = menu principal
// 1 = aguardando dados para agendar
// 2 = visualizando serviços
// 3 = visualizando localização
const estados = new Map();

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('📌 Escaneie o QR Code para conectar.');
});

client.on('ready', () => {
    console.log('✅ Bot conectado com sucesso.');
});

client.on('message', async msg => {
    const from = msg.from;
    const texto = msg.body.trim().toLowerCase();

    // Ativar bot
    if (gatilhos.includes(texto)) {
        usuariosAtivos.add(from);
        estados.set(from, 0);
        await msg.reply('👋 Ola sou assistente virtual Envie:\n1 - 📅Para agendar\n2 - 💈Ver Serviços\n3 - 📌Localização');
        return;
    }

    if (!usuariosAtivos.has(from)) {
        return;
    }

    // Comando voltar
    if (texto === 'voltar') {
        let estadoAtual = estados.get(from) || 0;
        if (estadoAtual > 0) {
            estados.set(from, 0);
            await msg.reply('Você voltou para o menu principal.');
            return enviarMensagemPorEstado(msg, 0);
        } else {
            await msg.reply('Você já está no menu principal.');
            return;
        }
    }

    const estadoAtual = estados.get(from) || 0;

    if (estadoAtual === 0) {
        if (texto === '1') {
            estados.set(from, 1);
            await msg.reply('Digite no formato: Nome,ID_do_Barbeiro,DataHora(YYYY-MM-DD HH:mm)\n\nPara voltar, digite "voltar".');
        } else if (texto === '2') {
            estados.set(from, 2);
            await msg.reply('Aqui estão os serviços disponíveis: Corte, Barba, etc.\n\nPara voltar, digite "voltar".');
        } else if (texto === '3') {
            estados.set(from, 3);
            await msg.reply('Nossa localização é: Rua Exemplo, 123.\n\nPara voltar, digite "voltar".');
        } else {
            await msg.reply('Opção inválida. Envie:\n1 - Para agendar\n2 - Ver Serviços\n3 - Localização');
        }
    } else if (estadoAtual === 1) {
        if (msg.body.includes(',') && msg.body.split(',').length === 3) {
            const [nome, barber_id, data_hora] = msg.body.split(',');
            try {
                await axios.post('http://localhost:3000/appointments', {
                    barber_id: barber_id.trim(),
                    cliente_nome: nome.trim(),
                    cliente_numero: from.replace('@c.us', ''),
                    data_hora: data_hora.trim()
                });
                await msg.reply(`✅ Agendamento confirmado para ${data_hora.trim()}.\n\nDigite "voltar" para retornar ao menu principal.`);
                estados.set(from, 0);
            } catch (err) {
                console.error(err);
                await msg.reply('❌ Erro ao criar agendamento. Tente novamente ou digite "voltar".');
            }
        } else {
            await msg.reply('Formato inválido. Digite no formato: Nome,ID_do_Barbeiro,DataHora(YYYY-MM-DD HH:mm)\n\nOu digite "voltar" para cancelar.');
        }
    } else if (estadoAtual === 2) {
        // Aqui só espera "voltar", qualquer outra mensagem avisa para digitar "voltar"
        await msg.reply('Você está visualizando os serviços. Digite "voltar" para retornar ao menu principal.');
    } else if (estadoAtual === 3) {
        // Aqui só espera "voltar", qualquer outra mensagem avisa para digitar "voltar"
        await msg.reply('Você está visualizando a localização. Digite "voltar" para retornar ao menu principal.');
    } else {
        estados.set(from, 0);
        await msg.reply('Voltando ao menu principal. Envie:\n1 - Para agendar\n2 - Ver Serviços\n3 - Localização');
    }
});

async function enviarMensagemPorEstado(msg, estado) {
    if (estado === 0) {
        await msg.reply('👋 Menu principal:\n1 - 📅Para agendar\n2 - 💈Ver Serviços\n3 - 📌Localização');
    } else if (estado === 1) {
        await msg.reply('Digite no formato: Nome,ID_do_Barbeiro,DataHora(YYYY-MM-DD HH:mm)\n\nPara voltar, digite "voltar".');
    } else if (estado === 2) {
        await msg.reply('Aqui estão os serviços disponíveis: Corte, Barba, etc.\n\nPara voltar, digite "voltar".');
    } else if (estado === 3) {
        await msg.reply('Nossa localização é: Rua Exemplo, 123.\n\nPara voltar, digite "voltar".');
    } else {
        await msg.reply('Voltando ao menu principal. Envie:\n1 - Para agendar\n2 - Ver Serviços\n3 - Localização');
    }
}

client.initialize();
