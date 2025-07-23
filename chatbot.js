const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const moment = require('moment');

const client = new Client({
    authStrategy: new LocalAuth()
});

// Estado dos usuários
const userState = {};

// Função para resetar estado
function resetState(from) {
    userState[from] = {
        step: 'menu',
        barber_id: null,
        date: null,
        time: null
    };
}

// Lista de barbeiros do banco
async function getBarbers() {
    const res = await axios.get('http://localhost:3000/barbers');
    return res.data;
}

// Lista horários disponíveis (9h às 18h a cada 1h)
async function getAvailableTimes(barber_id, date) {
    const res = await axios.get('http://localhost:3000/appointments');
    const booked = res.data
        .filter(a => a.barber_id == barber_id && a.data_hora.startsWith(date))
        .map(a => moment(a.data_hora).format('HH:mm'));

    const allTimes = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
    return allTimes.filter(t => !booked.includes(t));
}

// Bot conectado
client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
    console.log('📌 Escaneie o QR Code para conectar.');
});

client.on('ready', () => {
    console.log('✅ Bot conectado com sucesso.');
});

// Fluxo de mensagens
client.on('message', async msg => {
    // Ignorar mensagens de grupos
    if (msg.from.endsWith('@g.us')) {
        return; // não responde grupos
    }

    const from = msg.from;
    const text = msg.body.trim().toLowerCase();

    
    if (!userState[from]) resetState(from);

    const state = userState[from];

    // ===== MENU PRINCIPAL =====
    if (state.step === 'menu') {
        if (['oi', 'olá', 'menu', 'ola'].includes(text)) {
            await msg.reply('👋 Olá! Sou o assistente virtual da Barbearia. Escolha:\n1 - 📅 Agendar horário\n2 - 💈 Conheça-nos\n3 - 📌 Localização');
            return;
        }

        if (text === '1') {
            const barbers = await getBarbers();
            let list = 'Qual barbeiro você prefere?\n';
            barbers.forEach(b => list += `${b.id} - ${b.nome}
`);
            list += '0 - 🔙 Voltar';
            state.step = 'barber';
            await msg.reply(list);
            return;
        }

        if (text === '2') {
            await msg.reply('💈 Conheça - nos:\n- Barbearia fundada em 1900, a melhor da cidade');
            resetState(from);
            return;
        }

        if (text === '3') {
            await msg.reply('📌 Estamos na Rua 1, 123 - Centro.');
            resetState(from);
            return;
        }
    }

    // ===== ESCOLHA DO BARBEIRO =====
    if (state.step === 'barber') {
        if (text === '0') {
            resetState(from);
            await msg.reply('🔙 Voltando ao menu.\nEnvie "menu" para recomeçar.');
            return;
        }

        const barbers = await getBarbers();
        const selected = barbers.find(b => b.id == text);
        if (!selected) {
            await msg.reply('❌ Opção inválida. Escolha um número válido ou 0 para voltar.');
            return;
        }

        state.barber_id = selected.id;
        state.step = 'date';
        await msg.reply(`📅 Para que dia deseja marcar? (responda no formato DD/MM) \n0 - 🔙 Voltar`);
        return;
    }

    // ===== ESCOLHA DA DATA =====
    if (state.step === 'date') {
        if (text === '0') {
            resetState(from);
            await msg.reply('🔙 Voltando ao menu.\nEnvie "menu" para recomeçar.');
            return;
        }

        if (!/\d{2}\/\d{2}/.test(text)) {
            await msg.reply('❌ Data inválida. Use o formato DD/MM ou 0 para voltar.');
            return;
        }

        const [day, month] = text.split('/');
        const year = moment().year();
        const date = moment(`${year}-${month}-${day}`, 'YYYY-MM-DD');
        if (!date.isValid()) {
            await msg.reply('❌ Data inválida. Tente novamente.');
            return;
        }

        state.date = date.format('YYYY-MM-DD');
        const times = await getAvailableTimes(state.barber_id, state.date);
        if (times.length === 0) {
            await msg.reply('❌ Nenhum horário disponível neste dia. Tente outro dia.');
            return;
        }

        let list = `⏰ Horários disponíveis em ${text}:
`;
        times.forEach((t, i) => list += `${i + 1} - ${t}
`);
        list += '0 - 🔙 Voltar';
        state.step = 'time';
        state.availableTimes = times;
        await msg.reply(list);
        return;
    }

    // ===== ESCOLHA DO HORÁRIO =====
    if (state.step === 'time') {
        if (text === '0') {
            resetState(from);
            await msg.reply('🔙 Voltando ao menu.\nEnvie "menu" para recomeçar.');
            return;
        }

        const index = parseInt(text) - 1;
        if (isNaN(index) || !state.availableTimes[index]) {
            await msg.reply('❌ Opção inválida. Escolha um número válido ou 0 para voltar.');
            return;
        }

        state.time = state.availableTimes[index];
        state.step = 'confirm';
        await msg.reply(`✅ Confirmando:
Barbeiro: ${state.barber_id}
Dia: ${moment(state.date).format('DD/MM')} às ${state.time}

1 - Confirmar
0 - Cancelar`);
        return;
    }

    // ===== CONFIRMAÇÃO =====
    if (state.step === 'confirm') {
        if (text === '0') {
            resetState(from);
            await msg.reply('❌ Agendamento cancelado. \n Envie "menu" para recomeçar.');
            return;
        }

        if (text === '1') {
            try {
                await axios.post('http://localhost:3000/appointments', {
                    barber_id: state.barber_id,
                    cliente_nome: from,
                    cliente_numero: from.replace('@c.us', ''),
                    data_hora: `${state.date} ${state.time}`
                });
                await msg.reply(`✅ Agendamento confirmado para ${moment(state.date).format('DD/MM')} às ${state.time}.`);
            } catch (err) {
                console.error(err);
                await msg.reply('❌ Erro ao salvar agendamento.');
            }
            resetState(from);
            return;
        }
    }
});
client.initialize();
