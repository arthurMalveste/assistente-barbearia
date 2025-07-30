
const puppeteer = require('puppeteer');
const { executablePath } = puppeteer;
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const axios = require('axios');
const moment = require('moment');
const express = require('express');
const path = require('path');
const cors = require('cors');
const cron = require('node-cron');



const app = express();
const port = 3005;

const sqlite3 = require('sqlite3').verbose();
const dbPath = path.resolve(__dirname, 'db', 'barbearia.db');
const db = new sqlite3.Database(dbPath);
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type']
}));

let qrCodeImage = null;

let client;

const userState = {};

function resetState(from) {
    userState[from] = {
        step: 'menu',
        barber_id: null,
        barber_name: null,
        date: null,
        time: null,
        appointments: [],
        selectedAppointment: null
    };
}

async function getBarbers() {
    const res = await axios.get('http://localhost:3000/barbers');
    return res.data;
}

async function getClientAppointments(phone) {
    const res = await axios.get('http://localhost:3000/appointments');
    return res.data.filter(a => a.cliente_numero === phone);
}

async function getAvailableTimes(barber_id, date) {
    const res = await axios.get('http://localhost:3000/appointments');
    const booked = res.data
        .filter(a => a.barber_id == barber_id && a.data_hora.startsWith(date))
        .map(a => moment(a.data_hora).format('HH:mm'));

    const allTimes = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];
    return allTimes.filter(t => !booked.includes(t));
}

async function getConfig(chave) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath);
        db.get("SELECT valor FROM config WHERE chave = ?", [chave], (err, row) => {
            db.close();
            if (err) return reject(err);
            resolve(row ? row.valor : null);
        });
    });
}


async function startClient() {
  client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      executablePath: executablePath(),
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  });


    client.on('qr', async qr => {
        console.log('📌 Novo QR Code gerado!');
        qrCodeImage = await QRCode.toDataURL(qr);
    });

    client.on('ready', () => {
        console.log('✅ Bot conectado com sucesso!');
        qrCodeImage = null;
    });

    client.on('disconnected', async reason => {
        console.log(`❌ Cliente desconectado: ${reason}`);
        qrCodeImage = null;
        await client.destroy();
        startClient(); // reinicia o client para reconectar
    });

    client.on('auth_failure', async msg => {
        console.error('❌ Falha de autenticação', msg);
        qrCodeImage = null;
        await client.destroy();
        startClient(); // reinicia o client para tentar autenticar novamente
    });

    // ====================== SISTEMA DE LEMBRETES ==========================
   cron.schedule('* * * * *', async () => {
    console.log('🔔 Rodando verificação de lembretes...');
    try {
        const res = await axios.get('http://localhost:3000/appointments');
        const now = moment();
        const inOneHour = now.clone().add(1, 'hours');
        console.log(`Hora atual: ${now.format('YYYY-MM-DD HH:mm')}, +1 hora: ${inOneHour.format('YYYY-MM-DD HH:mm')}`);

        for (const appt of res.data) {
            console.log(`Verificando agendamento ${appt.id}, lembrete_enviado: ${appt.lembrete_enviado}`);
            if (appt.lembrete_enviado === 1) continue;  // Verifica se já foi enviado

            const apptTime = moment(appt.data_hora, 'YYYY-MM-DD HH:mm');
            console.log(`Data agendamento: ${apptTime.format('YYYY-MM-DD HH:mm')}`);

            if (apptTime.isBetween(now, inOneHour, null, '[]')) {  // inclui limites
                const msg = `⏰ Olá ${appt.cliente_nome}! Lembrete: seu horário na barbearia é hoje às ${apptTime.format('HH:mm')}. Até já!`;
                console.log(`Enviando lembrete para ${appt.cliente_numero}`);

                try {
                    // Envia o lembrete via WhatsApp
                    await client.sendMessage(`${appt.cliente_numero}@c.us`, msg);
                    console.log(`✅ Lembrete enviado para ${appt.cliente_numero}`);

                    // Atualiza o banco para marcar que o lembrete foi enviado
                    db.run(`UPDATE appointments SET lembrete_enviado = 1 WHERE id = ?`, [appt.id], function(err) {
                        if (err) {
                            console.error("Erro ao atualizar lembrete_enviado:", err.message);
                        } else {
                            console.log(`✅ Lembrete enviado e atualizado para agendamento ID ${appt.id}`);
                        }
                    });
                } catch (err) {
                    console.log(`❌ Erro ao enviar lembrete para ${appt.cliente_numero}:`, err.message);
                }
            }
        }
    } catch (err) {
        console.log('Erro no cron de lembretes:', err.message);
    }
});
    client.on('message', async msg => {
        if (msg.from.endsWith('@g.us')) return; // Ignorar grupos

        const from = msg.from;
        const text = msg.body.trim().toLowerCase();

        if (!userState[from]) resetState(from);
        const state = userState[from];

        // ===== MENU PRINCIPAL =====
        if (state.step === 'menu') {
            if (['oi', 'olá', 'menu', 'ola'].includes(text)) {
                // Pega agendamentos futuros do usuário
                const appointments = await getClientAppointments(from.replace('@c.us', ''));
                const futureAppointments = appointments.filter(a => moment(a.data_hora).isAfter(moment()));

                if (futureAppointments.length > 0) {
                    // Pega o próximo agendamento (mais próximo no tempo)
                    const nextAppointment = futureAppointments.sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora))[0];
                    const barber = (await getBarbers()).find(b => b.id === nextAppointment.barber_id);

                    await msg.reply(
                        `👋 Olá! Você tem um agendamento no dia ${moment(nextAppointment.data_hora).format('DD/MM')} às ${moment(nextAppointment.data_hora).format('HH:mm')} com o barbeiro ${barber ? barber.nome : 'desconhecido'}.\n` +
                        `Deseja:\n1 - 🔄 Remarcar\n2 - ❌ Cancelar\n3 - 📅 Agendar outro horário\n0 - 🔙 Voltar`
                    );
                    state.step = 'reminder_options';
                    state.appointments = futureAppointments; // Salva os agendamentos para usar no fluxo de remarcar/cancelar
                    return;
                }

                // Se não tiver agendamento futuro, mostra menu normal
                await msg.reply('👋 Olá! Sou o assistente virtual da Barbearia. Escolha:\n1 - 📅 Agendar horário\n2 - 💈 Valores\n3 - 📌 Localização\n4 - 🔄 Remarcar ou Cancelar horário');
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
            const descricao = await getConfig('descricao') || 'Informação não disponível.';
            await msg.reply(descricao);
            resetState(from);
            return;
            }

            if (text === '3') {
            const endereco = await getConfig('endereco') || 'Endereço 📌 Estamos na Rua Fictícia, 123 - Centro.';
            await msg.reply(endereco);
            resetState(from);
            return;
            }

            if (text === '4') {
                state.step = 'manage';
                await msg.reply('O que deseja fazer?\n1 - 🔄 Remarcar horário\n2 - ❌ Cancelar horário\n0 - 🔙 Voltar');
                return;
            }
        }

        // ===== REMINDER OPTIONS =====
        if (state.step === 'reminder_options') {
            if (text === '0') {
                resetState(from);
                await msg.reply('🔙 Voltando ao menu.\nEnvie "menu" para recomeçar.');
                return;
            }

            if (text === '1') {
                // Remarcar
                state.step = 'reschedule_select';
                const barbers = await getBarbers();
let list = 'Seus agendamentos:\n';
state.appointments.forEach((a, i) => {
    const barber = barbers.find(b => b.id === a.barber_id);
    list += `${i + 1} - ${barber ? barber.nome : 'Barbeiro desconhecido'} em ${moment(a.data_hora).format('DD/MM HH:mm')}\n`;
});

                list += '0 - 🔙 Voltar';
                await msg.reply(list);
                return;
            }

            if (text === '2') {
                // Cancelar
                state.step = 'cancel_select';
                const barbers = await getBarbers();
let list = 'Seus agendamentos:\n';
state.appointments.forEach((a, i) => {
    const barber = barbers.find(b => b.id === a.barber_id);
    list += `${i + 1} - ${barber ? barber.nome : 'Barbeiro desconhecido'} em ${moment(a.data_hora).format('DD/MM HH:mm')}\n`;
});

                list += '0 - 🔙 Voltar';
                await msg.reply(list);
                return;
            }

            if (text === '3') {
                // Agendar outro horário
                state.step = 'barber';
                const barbers = await getBarbers();
                let list = 'Qual barbeiro você prefere?\n';
                barbers.forEach(b => list += `${b.id} - ${b.nome}\n`);
                list += '0 - 🔙 Voltar';
                await msg.reply(list);
                return;
            }

            await msg.reply('❌ Opção inválida. Por favor, escolha uma das opções listadas.');
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
                const appointments = await getClientAppointments(from.replace('@c.us', ''));
                if (appointments.length === 0) {
                    await msg.reply('❌ Você não possui agendamentos futuros.');
                    resetState(from);
                    return;
                }

                state.appointments = appointments;
                state.step = text === '1' ? 'reschedule_select' : 'cancel_select';

                const barbers = await getBarbers();
let list = 'Seus agendamentos:\n';
state.appointments.forEach((a, i) => {
    const barber = barbers.find(b => b.id === a.barber_id);
    list += `${i + 1} - ${barber ? barber.nome : 'Barbeiro desconhecido'} em ${moment(a.data_hora).format('DD/MM HH:mm')}\n`;
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
    // Aí não selecionamos mais barber_id direto, vamos pedir para escolher barbeiro
    state.step = 'reschedule_barber';

    const barbers = await getBarbers();
    let list = 'Qual barbeiro você prefere para remarcar?\n';
    barbers.forEach(b => list += `${b.id} - ${b.nome}\n`);
    list += '0 - 🔙 Voltar';

    await msg.reply(list);
    return;
}

// Nova etapa 'reschedule_barber' para escolher barbeiro na remarcação
if (state.step === 'reschedule_barber') {
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
    state.barber_name = selected.nome;
    state.step = 'reschedule_date';
    await msg.reply('📅 Para que dia deseja remarcar? (responda no formato DD/MM)\n0 - 🔙 Voltar');
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
    const currentYear = moment().year();

    let date = moment(`${currentYear}-${month}-${day}`, 'YYYY-MM-DD');

    if (!date.isValid() || date.isBefore(moment().startOf('day'))) {
        await msg.reply('❌ Data inválida ou passada. Escolha uma data válida a partir de hoje.');
        return;
    }

    state.date = date.format('YYYY-MM-DD');
    const times = await getAvailableTimes(state.barber_id, state.date);
    if (times.length === 0) {
        await msg.reply('❌ Nenhum horário disponível neste dia. Tente outro dia.');
        return;
    }

    let list = `⏰ Horários disponíveis em ${text}:\n`;
    times.forEach((t, i) => list += `${i + 1} - ${t}\n`);
    list += '0 - 🔙 Voltar';
    state.step = 'reschedule_time';
    state.availableTimes = times;
    await msg.reply(list);
    return;
}
// ===== CONFIRMAÇÃO DE REMARCAÇÃO =====
if (state.step === 'reschedule_time') {
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
    state.step = 'reschedule_confirm';

    await msg.reply(
        `✅ Confirmando nova data:\n` +
        `Barbeiro: ${state.barber_name}\n` +
        `Dia: ${moment(state.date).format('DD/MM')} às ${state.time}\n\n` +
        `1 - Confirmar remarcação\n0 - Cancelar`
    );
    return;
}

// ===== APLICAR REMARCAÇÃO =====
if (state.step === 'reschedule_confirm') {
    if (text === '0') {
        resetState(from);
        await msg.reply('❌ Remarcação cancelada. Envie "menu" para recomeçar.');
        return;
    }

    if (text === '1') {
        try {
            await axios.put(`http://localhost:3000/appointments/${state.selectedAppointment.id}`, {
                data_hora: `${state.date} ${state.time}`,
                lembrete_enviado: false // Reinicia lembrete
            });

            await msg.reply(`🔄 Agendamento atualizado para ${moment(state.date).format('DD/MM')} às ${state.time}.`);
        } catch (err) {
            await msg.reply('❌ Erro ao remarcar. Tente novamente.');
        }

        resetState(from);
        return;
    }

    await msg.reply('❌ Opção inválida. Confirme com 1 ou cancele com 0.');
    return;
}

        // ===== ESCOLHA DO BARBEIRO (AGENDAMENTO) =====
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
            state.barber_name = selected.nome;
            state.step = 'date';
            await msg.reply(`📅 Para que dia deseja marcar? (responda no formato DD/MM)\n0 - 🔙 Voltar`);
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
            const currentYear = moment().year();

            let date = moment(`${currentYear}-${month}-${day}`, 'YYYY-MM-DD');

            if (!date.isValid() || date.isBefore(moment().startOf('day'))) {
                await msg.reply('❌ Data inválida ou passada. Escolha uma data válida a partir de hoje.');
                return;
            }

            state.date = date.format('YYYY-MM-DD');
            const times = await getAvailableTimes(state.barber_id, state.date);
            if (times.length === 0) {
                await msg.reply('❌ Nenhum horário disponível neste dia. Tente outro dia.');
                return;
            }

            let list = `⏰ Horários disponíveis em ${text}:\n`;
            times.forEach((t, i) => list += `${i + 1} - ${t}\n`);
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

            const dataHoraEscolhida = moment(`${state.date} ${state.time}`, 'YYYY-MM-DD HH:mm');
            if (dataHoraEscolhida.isBefore(moment())) {
                await msg.reply('❌ Você não pode agendar para um horário que já passou. Escolha outro.');
                return;
            }

            state.step = 'confirm';
            await msg.reply(
                `✅ Confirmando:\n` +
                `Barbeiro: ${state.barber_name}\n` +
                `Dia: ${moment(state.date).format('DD/MM')} às ${state.time}\n\n` +
                `1 - Confirmar\n0 - Cancelar`
            );
            return;
        }

        // ===== CONFIRMAÇÃO DO AGENDAMENTO =====
        if (state.step === 'confirm') {
            if (text === '0') {
                resetState(from);
                await msg.reply('❌ Agendamento cancelado. \n Envie "menu" para recomeçar.');
                return;
            }

            if (text === '1') {
    try {
        const contact = await client.getContactById(from);
        const nomeCliente = contact.pushname || contact.name || 'Cliente WhatsApp';

        await axios.post('http://localhost:3000/appointments', {
            barber_id: state.barber_id,
            cliente_nome: nomeCliente,
            cliente_numero: from.replace('@c.us', ''),
            data_hora: `${state.date} ${state.time}`,
            lembrete_enviado: false
        });

        await msg.reply(`✅ Agendamento confirmado para ${moment(state.date).format('DD/MM')} às ${state.time}.`);
    } catch (err) {
        if (err.response && err.response.status === 409) {
            await msg.reply('❌ Este horário acabou de ser ocupado. Por favor, escolha outro.');
        } else {
            await msg.reply('❌ Erro ao salvar agendamento.');
        }
    }
    resetState(from);
    return;
}
        }
    });

    client.initialize();
}

// Verificação periódica para reiniciar se desconectado (evita bugs)
setInterval(async () => {
    if (!client) return;
    try {
        const state = await client.getState();
        if (state !== 'CONNECTED') {
            console.log('⚠️ Cliente não está conectado:', state);
            qrCodeImage = null;
            await client.destroy();
            startClient();
        }
    } catch (error) {
        console.log('❌ Erro ao verificar estado:', error.message);
        qrCodeImage = null;
        if(client) await client.destroy();
        startClient();
    }
}, 30000);

app.get('/qr-code', async (req, res) => {
    let connected = false;
    try {
        const state = await client.getState();
        connected = state === 'CONNECTED';
    } catch {
        connected = false;
    }

    res.json({
        connected,
        qr: connected ? null : qrCodeImage
    });
});

app.use(express.static(path.join(__dirname, '..', 'front-end')));
app.get('/test-lembrete', async (req, res) => {
    try {
        const resApi = await axios.get('http://localhost:3000/appointments');
        const now = moment();
        const inOneHour = now.clone().add(1, 'hours');

        const futuros = [];

        for (const appt of resApi.data) {
            const apptTime = moment(appt.data_hora, 'YYYY-MM-DD HH:mm');
            if (apptTime.isBetween(now, inOneHour, null, '[]') && !appt.lembrete_enviado) {
                futuros.push({
                    id: appt.id,
                    cliente: appt.cliente_nome,
                    numero: appt.cliente_numero,
                    data_hora: apptTime.format('YYYY-MM-DD HH:mm')
                });
            }
        }

        res.json({
            agora: now.format('YYYY-MM-DD HH:mm'),
            ate: inOneHour.format('YYYY-MM-DD HH:mm'),
            lembretesEncontrados: futuros.length,
            lembretes: futuros
        });

    } catch (err) {
        console.error('Erro no teste de lembrete:', err.message);
        res.status(500).send('Erro no teste de lembrete.');
    }
});
app.listen(port, () => {
    console.log(`🌐 QR Code disponível em http://localhost:${port}/qrcode.html`);
});

startClient();
