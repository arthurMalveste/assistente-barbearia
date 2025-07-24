const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const moment = require('moment');

const client = new Client({
    authStrategy: new LocalAuth()
});

// Estado dos usuários
const userState = {};

// Resetar estado
function resetState(from) {
    userState[from] = {
        step: 'menu',
        barber_id: null,
        date: null,
        time: null,
        appointments: [],
        selectedAppointment: null,
        availableTimes: []
    };
}

// Buscar barbeiros
async function getBarbers() {
    const res = await axios.get('http://localhost:3000/barbers');
    return res.data;
}

// Buscar agendamentos do cliente
async function getClientAppointments(phone) {
    const res = await axios.get('http://localhost:3000/appointments');
    return res.data.filter(a => a.cliente_numero === phone);
}

// Buscar horários disponíveis
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
    if (msg.from.endsWith('@g.us')) return; // Ignorar grupos

    const from = msg.from;
    const text = msg.body.trim().toLowerCase();

    if (!userState[from]) resetState(from);
    const state = userState[from];

    // ===== MENU PRINCIPAL =====
    if (state.step === 'menu') {
        if (['oi', 'olá', 'menu', 'ola'].includes(text)) {
            await msg.reply('👋 Olá! Sou o assistente virtual da Barbearia. Escolha:\n1 - 📅 Agendar horário\n2 - 💈 Conheça-nos\n3 - 📌 Localização\n4 - 🔄 Remarcar ou Cancelar horário');
            return;
        }

        if (text === '1') {
            const barbers = await getBarbers();
            let list = 'Qual barbeiro você prefere?\n';
            barbers.forEach(b => list += `${b.id} - ${b.nome}\n`);
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

        if (text === '4') {
            state.step = 'manage';
            await msg.reply('O que deseja fazer?\n1 - 🔄 Remarcar horário\n2 - ❌ Cancelar horário\n0 - 🔙 Voltar');
            return;
        }
    }

    // ===== ESCOLHER BARBEIRO =====
    if (state.step === 'barber') {
        if (text === '0') {
            resetState(from);
            await msg.reply('🔙 Voltando ao menu.\nEnvie "menu" para recomeçar.');
            return;
        }

        const barberId = parseInt(text);
        const barbers = await getBarbers();
        const selectedBarber = barbers.find(b => b.id === barberId);

        if (!selectedBarber) {
            await msg.reply('❌ Barbeiro inválido. Tente novamente.');
            return;
        }

        state.barber_id = barberId;
        state.step = 'date';
        await msg.reply('📅 Para qual dia deseja agendar? (DD/MM)\n0 - 🔙 Voltar');
        return;
    }

    // ===== ESCOLHER DATA =====
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

if (date.isBefore(moment(), 'day')) {
    await msg.reply('❌ Não é possível agendar para datas passadas. Escolha uma data futura.');
    return;
}


        state.date = date.format('YYYY-MM-DD');
        const times = await getAvailableTimes(state.barber_id, state.date);

        if (times.length === 0) {
            await msg.reply('❌ Nenhum horário disponível neste dia. Tente outra data.');
            return;
        }

        let list = `⏰ Horários disponíveis:\n`;
        times.forEach((t, i) => list += `${i + 1} - ${t}\n`);
        list += '0 - 🔙 Voltar';
        state.availableTimes = times;
        state.step = 'time';
        await msg.reply(list);
        return;
    }

    // ===== ESCOLHER HORÁRIO =====
    if (state.step === 'time') {
        if (text === '0') {
            resetState(from);
            await msg.reply('🔙 Voltando ao menu.\nEnvie "menu" para recomeçar.');
            return;
        }

        const index = parseInt(text) - 1;
        if (isNaN(index) || !state.availableTimes[index]) {
            await msg.reply('❌ Opção inválida.');
            return;
        }

        state.time = state.availableTimes[index];
        const phone = from.replace('@c.us', '');

        await axios.post('http://localhost:3000/appointments', {
            barber_id: state.barber_id,
            cliente_nome: 'Cliente WhatsApp', // opcional: peça nome do cliente em outro passo
            cliente_numero: phone,
            data_hora: `${state.date} ${state.time}`,
            status: 'confirmado'
        });

        await msg.reply(`✅ Agendamento confirmado para ${moment(state.date).format('DD/MM')} às ${state.time}.`);
        resetState(from);
        return;
    }

    // ===== GERENCIAR AGENDAMENTO =====
    if (state.step === 'manage') {
        if (text === '0') {
            resetState(from);
            await msg.reply('🔙 Voltando ao menu.\nEnvie "menu" para recomeçar.');
            return;
        }

        if (['1', '2'].includes(text)) {
            const phoneNumber = from.replace('@c.us', '');
            const appointments = await getClientAppointments(phoneNumber);
            if (appointments.length === 0) {
                await msg.reply('❌ Você não possui agendamentos futuros.');
                resetState(from);
                return;
            }

            state.appointments = appointments;
state.step = text === '1' ? 'reschedule_select' : 'cancel_select';

const barbers = await getBarbers();

let list = 'Seus agendamentos:\n';
appointments.forEach((a, i) => {
    const barber = barbers.find(b => b.id === a.barber_id);
    const barberName = barber ? barber.nome : `ID ${a.barber_id}`;
    list += `${i + 1} - ${barberName} em ${moment(a.data_hora).format('DD/MM HH:mm')}\n`;
});
list += '0 - 🔙 Voltar';
await msg.reply(list);
            return;
        }
    }

    // ===== CANCELAR =====
    if (state.step === 'cancel_select') {
        if (text === '0') {
            resetState(from);
            await msg.reply('🔙 Voltando ao menu.\nEnvie "menu" para recomeçar.');
            return;
        }

        const index = parseInt(text) - 1;
        if (isNaN(index) || !state.appointments[index]) {
            await msg.reply('❌ Opção inválida.');
            return;
        }

        const appt = state.appointments[index];
        await axios.delete(`http://localhost:3000/appointments/${appt.id}`);

        await msg.reply(`❌ Agendamento de ${moment(appt.data_hora).format('DD/MM HH:mm')} cancelado.`);
        resetState(from);
        return;
    }

    // ===== REMARCAR =====
    if (state.step === 'reschedule_select') {
        if (text === '0') {
            resetState(from);
            await msg.reply('🔙 Voltando ao menu.\nEnvie "menu" para recomeçar.');
            return;
        }

        const index = parseInt(text) - 1;
        if (isNaN(index) || !state.appointments[index]) {
            await msg.reply('❌ Opção inválida.');
            return;
        }

        state.selectedAppointment = state.appointments[index];
        state.barber_id = state.selectedAppointment.barber_id;
        state.step = 'reschedule_date';
        await msg.reply('📅 Para que dia deseja remarcar? (DD/MM)\n0 - 🔙 Voltar');
        return;
    }

    if (state.step === 'reschedule_date') {
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

if (date.isBefore(moment(), 'day')) {
    await msg.reply('❌ Não é possível agendar para datas passadas. Escolha uma data futura.');
    return;
}


        state.date = date.format('YYYY-MM-DD');
        const times = await getAvailableTimes(state.barber_id, state.date);
        if (times.length === 0) {
            await msg.reply('❌ Nenhum horário disponível neste dia.');
            return;
        }

        let list = `⏰ Horários disponíveis:\n`;
        times.forEach((t, i) => list += `${i + 1} - ${t}\n`);
        list += '0 - 🔙 Voltar';
        state.availableTimes = times;
        state.step = 'reschedule_time';
        await msg.reply(list);
        return;
    }

    if (state.step === 'reschedule_time') {
        if (text === '0') {
            resetState(from);
            await msg.reply('🔙 Voltando ao menu.\nEnvie "menu" para recomeçar.');
            return;
        }

        const index = parseInt(text) - 1;
        if (isNaN(index) || !state.availableTimes[index]) {
            await msg.reply('❌ Opção inválida.');
            return;
        }

        state.time = state.availableTimes[index];
        await axios.put(`http://localhost:3000/appointments/${state.selectedAppointment.id}`, {
            data_hora: `${state.date} ${state.time}`
        });
        await msg.reply(`✅ Agendamento remarcado para ${moment(state.date).format('DD/MM')} às ${state.time}.`);
        resetState(from);
        return;
    }
});

client.initialize();
