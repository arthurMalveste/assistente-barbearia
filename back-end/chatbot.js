/*
 * chatbot.js - Versão Consolidada e Corrigida
 * Supervisor: Gemini AI
 * Data da Revisão: 02/08/2025
 *
 * ######################################################################################
 * ##                                                                                  ##
 * ##  Este arquivo combina a lógica de negócio funcional da versão antiga com o       ##
 * ##  sistema de API Key e arquitetura multi-tenant da nova versão.                  ##
 * ##                                                                                  ##
 * ######################################################################################
 */

// --- Módulos Principais ---
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const QRCode = require('qrcode');
const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const axios = require('axios');
const moment = require('moment');
const fs = require('fs/promises');

// --- Configuração Inicial ---
require('moment/locale/pt-br');
moment.locale('pt-br');

// Variáveis de Configuração Multi-tenant
const API_KEY = process.env.API_KEY || '03ba3d1a-485b-40a0-bdcb-08f2b2a308ed';
const PORT = process.env.PORT || 3005;
const AUTH_INFO_PATH = process.env.AUTH_INFO_PATH || 'baileys_auth_info_multi';

// Cliente Axios com a API Key de autenticação
const apiClient = axios.create({
    baseURL: 'http://localhost:3000', // URL da sua API
    headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json'
    }
});

const app = express();
app.use(cors());
app.use(express.json());

// --- Variáveis de Estado do Bot ---
let sock;
let qrCodeImage = null;
let connectionState = 'starting';
const userState = {};
let barbers = [];

// ##################################################################
// ##               FUNÇÕES AUXILIARES E DE NEGÓCIO                ##
// ##################################################################

/**
 * Reseta o estado do usuário para o menu inicial.
 * @param {string} from - O JID do usuário.
 */
function resetState(from) {
    userState[from] = {
        step: 'menu',
        history: [],
        barber_id: null,
        barber_name: null,
        date: null,
        time: null,
        appointments: [],
        selectedAppointment: null
    };
}

/**
 * Avança o estado do usuário para o próximo passo.
 * @param {string} from - O JID do usuário.
 * @param {string} nextStep - O próximo passo do fluxo.
 */
function advanceState(from, nextStep) {
    const state = userState[from];
    if (state.step !== nextStep && state.step !== 'menu') {
        state.history.push(state.step);
    }
    state.step = nextStep;
    console.log(`[STATE] ${from} - Avançando para: ${nextStep}. Histórico: ${state.history}`);
}

/**
 * Retorna o estado do usuário para o passo anterior.
 * @param {string} from - O JID do usuário.
 */
function goBackState(from) {
    const state = userState[from];
    if (state.history.length > 0) {
        state.step = state.history.pop();
    } else {
        state.step = 'menu';
    }
    console.log(`[STATE] ${from} - Voltando para: ${state.step}. Histórico: ${state.history}`);
}

/**
 * Recarrega a lista de barbeiros da API.
 */
async function reloadBarbers() {
    try {
        const res = await apiClient.get('/barbers');
        barbers = res.data;
        console.log(`✅ Lista de barbeiros recarregada. Total: ${barbers.length}`);
    } catch (err) {
        console.error('❌ Erro ao recarregar a lista de barbeiros da API:', err);
    }
}

/**
 * Busca os agendamentos de um cliente específico.
 * @param {string} phone - O número de telefone do cliente.
 * @returns {Array} - Uma lista de agendamentos.
 */
async function getClientAppointments(phone) {
    try {
        const res = await apiClient.get(`/appointments`);
        return res.data.filter(a => a.cliente_numero && a.cliente_numero.includes(phone));
    } catch (err) {
        console.error('❌ Erro ao buscar agendamentos do cliente na API:', err);
        return [];
    }
}

/**
 * Busca os horários disponíveis para um barbeiro em uma data específica.
 *
 * @param {number} barber_id - O ID do barbeiro.
 * @param {string} date - A data no formato 'YYYY-MM-DD'.
 * @returns {Array<string>} - Uma lista de horários disponíveis no formato 'HH:mm'.
 */
async function getAvailableTimes(barber_id, date) {
    try {
        const res = await apiClient.get(`/appointments`);
        const booked = res.data
            .filter(a => a.barber_id === barber_id && moment(a.data_hora).format('YYYY-MM-DD') === date)
            .map(a => moment(a.data_hora).format('HH:mm'));
        const allTimes = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];
        const availableTimes = allTimes.filter(t => {
            // Verifica se o horário já foi reservado
            if (booked.includes(t)) {
                return false;
            }

            // CORRIGIDO: Verifica se o horário já passou
            const appointmentDateTime = moment(`${date} ${t}`, 'YYYY-MM-DD HH:mm');
            return appointmentDateTime.isAfter(moment());
        });
        return availableTimes;
    } catch (err) {
        console.error('❌ Erro ao buscar horários disponíveis na API:', err);
        return [];
    }
}

/**
 * Busca uma configuração específica da API.
 * @param {string} chave - A chave da configuração.
 * @returns {string|null} - O valor da configuração ou null se não encontrada.
 */
async function getConfig(chave) {
    try {
        const res = await apiClient.get(`/config/${chave}`);
        return res.data.valor;
    } catch (err) {
        if (err.response && err.response.status === 404) {
            return null;
        }
        console.error(`❌ Erro ao buscar configuração '${chave}':`, err);
        return null;
    }
}

// ##################################################################
// ##               NOVA FUNÇÃO: getMenuMessageForState            ##
// ##################################################################

/**
 * Retorna a mensagem de menu apropriada para o estado atual do usuário.
 * @param {string} step - O passo atual do fluxo.
 * @param {object} state - O objeto de estado do usuário.
 * @returns {Promise<string>} - A mensagem de texto a ser enviada.
 */
async function getMenuMessageForState(step, state) {
    switch (step) {
        case 'menu':
            // Recarrega a lista de barbeiros para garantir que esteja atualizada
            await reloadBarbers();
            return '👋 Olá! Sou o assistente virtual da Barbearia. Escolha uma opção:\n\n*1* - 📅 Agendar um horário\n*2* - 💈 Ver serviços e valores\n*3* - 📌 Ver nossa localização\n*4* - 🔄 Remarcar ou Cancelar um horário';
        case 'reminder_options':
            return 'O que deseja fazer?\n*1* - 🔄 Remarcar este horário\n*2* - ❌ Cancelar este horário\n*3* - 📅 Agendar um novo horário\n*0* - 🔙 Voltar';
        case 'manage_select_appointment':
            const appointments = await getClientAppointments(state.selectedAppointment ? state.selectedAppointment.cliente_numero : state.fromNumber);
            const futureAppointments = appointments.filter(a => moment(a.data_hora).isAfter(moment()));
            state.appointments = futureAppointments;
            let list = 'Você tem os seguintes agendamentos:\n';
            futureAppointments.forEach((a, i) => {
                const barber = barbers.find(b => b.id === a.barber_id);
                list += `\n*${i + 1}* - ${barber ? barber.nome : 'Barbeiro'} em ${moment(a.data_hora).format('ddd, DD/MM [às] HH:mm')}`;
            });
            return list + '\n\nDigite o número do agendamento que deseja gerenciar ou *0* para voltar.';
        case 'manage_select_action':
            return `O que deseja fazer com o agendamento de ${moment(state.selectedAppointment.data_hora).format('DD/MM [às] HH:mm')}?\n\n*1* - 🔄 Remarcar\n*2* - ❌ Cancelar\n\n*0* - 🔙 Voltar`;
        case 'barber':
        case 'reschedule_barber':
            await reloadBarbers(); // Garante que a lista está atualizada
            let listBarbers = 'Qual barbeiro você prefere?\n\n';
            barbers.forEach(b => listBarbers += `*${b.id}* - ${b.nome}\n`);
            listBarbers += '\n*0* - 🔙 Voltar ao menu';
            return listBarbers;
        case 'date':
        case 'reschedule_date':
            // Filtra apenas dias futuros ou o dia atual
            const diasDisponiveis = Array.from({ length: 7 }, (_, i) => moment().add(i, 'days')).filter(d => d.isSameOrAfter(moment(), 'day'));
            let listaDias = '📅 Ótimo! Agora escolha o dia:\n\n';
            diasDisponiveis.forEach((d, i) => {
                listaDias += `*${i + 1}* - ${d.format('dddd, DD/MM')}\n`;
            });
            listaDias += '\n*0* - 🔙 Voltar';
            state.availableDates = diasDisponiveis.map(d => d.format('YYYY-MM-DD'));
            return listaDias;
        case 'time':
        case 'reschedule_time':
            if (!state.barber_id || !state.date) {
                return 'Houve um problema para encontrar os horários. Por favor, digite *0* para voltar ao passo anterior.';
            }
            const times = await getAvailableTimes(state.barber_id, state.date);
            if (times.length === 0) {
                return `❌ Nenhum horário disponível para este dia com este barbeiro. Por favor, digite *0* para escolher outro dia ou *0* novamente para escolher outro barbeiro.`;
            }
            let listTimes = `⏰ Perfeito! Horários disponíveis para ${moment(state.date).format('DD/MM')}:\n\n`;
            times.forEach((t, i) => listTimes += `*${i + 1}* - ${t}\n`);
            listTimes += '\n*0* - 🔙 Voltar';
            state.availableTimes = times;
            return listTimes;
        case 'confirm':
        case 'reschedule_confirm':
            return `✅ Por favor, confirme os detalhes:\n\n*Barbeiro:* ${state.barber_name}\n*Data:* ${moment(state.date).format('dddd, DD/MM/YYYY')}\n*Horário:* ${state.time}\n\n*1* - 👍 Confirmar\n*0* - 👎 Cancelar`;
        default:
            return 'Envie "oi" ou "menu" para ver as opções.';
    }
}


// ##################################################################
// ##            NÚCLEO DO BOT - CONEXÃO COM WHATSAPP              ##
// ##################################################################

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_INFO_PATH);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`🔌 [BAILEYS] Usando versão: ${version.join('.')}, é a mais recente: ${isLatest}`);
    sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: state,
        browser: ['Bot-Barbearia', 'Chrome', '1.0.0']
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log(`📌 [QRCODE] Novo QR Code gerado para ${AUTH_INFO_PATH}.`);
            qrCodeImage = await QRCode.toDataURL(qr);
            connectionState = 'qr';
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(`❌ [CONNECTION] Conexão fechada: ${lastDisconnect.error}, reconectando: ${shouldReconnect}`);
            qrCodeImage = null;
            connectionState = 'disconnected';

            if (lastDisconnect.error instanceof Boom) {
                const statusCode = lastDisconnect.error.output.statusCode;
                if (statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.badSession) {
                    console.log(`🗑️ [AUTH] Sessão inválida para ${AUTH_INFO_PATH}. Removendo credenciais para forçar novo QR Code.`);
                    try {
                        await fs.rm(AUTH_INFO_PATH, { recursive: true, force: true });
                        console.log('✅ [AUTH] Credenciais antigas removidas com sucesso.');
                    } catch (err) {
                        console.error('❌ [AUTH] Erro ao remover credenciais antigas:', err);
                    }
                }
            }
            if (shouldReconnect) {
                setTimeout(connectToWhatsApp, 5000);
            } else {
                console.log('🚫 [CONNECTION] Não reconectando automaticamente.');
            }
        } else if (connection === 'open') {
            console.log('✅ [CONNECTION] Cliente WhatsApp conectado com sucesso!');
            qrCodeImage = null;
            connectionState = 'connected';
            await reloadBarbers(); // Recarrega a lista de barbeiros ao conectar
        }
    });
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];

        if (!msg.message || msg.key.fromMe || msg.key.remoteJid.endsWith('@g.us')) {
            return;
        }

        const from = msg.key.remoteJid;
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim().toLowerCase();
        const fromNumber = from.split('@')[0];

        if (!userState[from]) {
            resetState(from);
        }

        const state = userState[from];
        state.fromNumber = fromNumber;
        const reply = async (message) => await sock.sendMessage(from, { text: message });

        // ##################################################################
        // ##              MÁQUINA DE ESTADOS DA CONVERSA                  ##
        // ##################################################################

        try {
            if (text === '0' || text === 'voltar') {
                if (state.step === 'menu' && state.history.length === 0) {
                    await reply('Você já está no menu principal. Escolha uma opção ou diga "oi" para ver o menu novamente.');
                } else {
                    goBackState(from);
                    await reply(`Ok, voltando. ${await getMenuMessageForState(state.step, state)}`);
                }
                return;
            }

            if (state.step === 'menu') {
                if (['oi', 'olá', 'ola', 'menu', 'oi!', 'ola!'].includes(text)) {
                    await reloadBarbers();
                    const appointments = await getClientAppointments(fromNumber);
                    const futureAppointments = appointments.filter(a => moment(a.data_hora).isAfter(moment()));

                    if (futureAppointments.length === 0) {
                        await reply('👋 Olá! Sou o assistente virtual da Barbearia. Escolha uma opção:\n\n*1* - 📅 Agendar um horário\n*2* - 💈 Ver serviços e valores\n*3* - 📌 Ver nossa localização\n*4* - 🔄 Gerenciar agendamentos (se houver)');
                        return;
                    }

                    futureAppointments.sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));
                    state.appointments = futureAppointments;

                    if (futureAppointments.length === 1) {
                        const nextAppointment = futureAppointments[0];
                        const barber = barbers.find(b => b.id === nextAppointment.barber_id);
                        advanceState(from, 'reminder_options');
                        await reply(
                            `👋 Olá! Você já tem um agendamento no dia ${moment(nextAppointment.data_hora).format('DD/MM')} às ${moment(nextAppointment.data_hora).format('HH:mm')} com o barbeiro ${barber ? barber.nome : 'desconhecido'}.\n\n` +
                            `O que deseja fazer?\n*1* - 🔄 Remarcar este horário\n*2* - ❌ Cancelar este horário\n*3* - 📅 Agendar um novo horário\n*0* - 🔙 Voltar`
                        );
                        return;
                    }

                    if (futureAppointments.length > 1) {
                        advanceState(from, 'multi_appointment_menu');
                        await reply(
                            `👋 Olá! Verifiquei que você tem *${futureAppointments.length} agendamentos* futuros conosco.\n\n` +
                            `O que você gostaria de fazer?\n` +
                            `*1* - 🗒️ Ver meus horários\n` +
                            `*2* - 🔄 Remarcar um horário\n` +
                            `*3* - ❌ Cancelar um horário\n` +
                            `*4* - 📅 Agendar um novo horário\n` +
                            `*0* - 🔙 Sair`
                        );
                        return;
                    }
                }
                if (text === '1') {
                    let list = 'Qual barbeiro você prefere?\n\n';
                    barbers.forEach(b => list += `*${b.id}* - ${b.nome}\n`);
                    list += '\n*0* - 🔙 Voltar';
                    advanceState(from, 'barber');
                    await reply(list);
                    return;
                }
                if (text === '2') {
                    const descricao = await getConfig('descricao') || 'Informação sobre valores não disponível no momento.';
                    await reply(descricao);
                    resetState(from);
                    return;
                }
                if (text === '3') {
                    const endereco = await getConfig('endereco') || 'Endereço não disponível no momento.';
                    await reply(endereco);
                    resetState(from);
                    return;
                }
                if (text === '4') {
                    const appointments = await getClientAppointments(fromNumber);
                    const futureAppointments = appointments.filter(a => moment(a.data_hora).isAfter(moment()));

                    if (futureAppointments.length === 0) {
                        await reply('❌ Você não possui agendamentos futuros para remarcar ou cancelar.');
                        resetState(from);
                        return;
                    }
                    state.appointments = futureAppointments;
                    let list = 'Você tem os seguintes agendamentos:\n';
                    state.appointments.forEach((a, i) => {
                        const barber = barbers.find(b => b.id === a.barber_id);
                        list += `\n*${i + 1}* - ${barber ? barber.nome : 'Barbeiro'} em ${moment(a.data_hora).format('ddd, DD/MM [às] HH:mm')}`;
                    });
                    advanceState(from, 'manage_select_appointment');
                    await reply(list + '\n\nDigite o número do agendamento que deseja gerenciar ou *0* para voltar.');
                    return;
                }
            }
            if (state.step === 'multi_appointment_menu') {
                if (text === '1') {
                    let list = '🗓️ Estes são seus próximos agendamentos:\n';
                    state.appointments.forEach((a) => {
                        const barber = barbers.find(b => b.id === a.barber_id);
                        list += `\n- Com *${barber ? barber.nome : 'Barbeiro'}* em ${moment(a.data_hora).format('dddd, DD/MM/YYYY [às] HH:mm')}`;
                    });
                    await reply(list);
                    await reply(
                        `O que você gostaria de fazer agora?\n` +
                        `*1* - 🗒️ Ver meus horários\n` +
                        `*2* - 🔄 Remarcar um horário\n` +
                        `*3* - ❌ Cancelar um horário\n` +
                        `*4* - 📅 Agendar um novo horário\n` +
                        `*0* - 🔙 Sair`
                    );
                    return;
                }
                if (text === '2') {
                    advanceState(from, 'manage_select_appointment');
                    let list = 'Você tem os seguintes agendamentos:\n';
                    state.appointments.forEach((a, i) => {
                        const barber = barbers.find(b => b.id === a.barber_id);
                        list += `\n*${i + 1}* - ${barber ? barber.nome : 'Barbeiro'} em ${moment(a.data_hora).format('ddd, DD/MM [às] HH:mm')}`;
                    });
                    await reply(list + '\n\nDigite o número do agendamento que deseja gerenciar ou *0* para voltar.');
                    return;
                }
                if (text === '3') {
                    advanceState(from, 'manage_select_appointment');
                    let list = 'Você tem os seguintes agendamentos:\n';
                    state.appointments.forEach((a, i) => {
                        const barber = barbers.find(b => b.id === a.barber_id);
                        list += `\n*${i + 1}* - ${barber ? barber.nome : 'Barbeiro'} em ${moment(a.data_hora).format('ddd, DD/MM [às] HH:mm')}`;
                    });
                    await reply(list + '\n\nDigite o número do agendamento que deseja gerenciar ou *0* para voltar.');
                    return;
                }
                if (text === '4') {
                    let list = 'Qual barbeiro você prefere?\n\n';
                    barbers.forEach(b => list += `*${b.id}* - ${b.nome}\n`);
                    list += '\n*0* - 🔙 Voltar ao menu';
                    advanceState(from, 'barber');
                    await reply(list);
                    return;
                }
                if (text === '0' || text === 'sair') {
                    resetState(from);
                    await reply('👋 Certo! Envie "oi" ou "menu" a qualquer momento para começarmos de novo.');
                    return;
                }
            }
            if (state.step === 'reminder_options' || state.step === 'manage_select_action') {
                if (text === '1') {
                    // Remarcar
                    const appointmentId = state.selectedAppointment?.id;
                    if (!appointmentId) {
                        await reply('❌ Desculpe, não consegui encontrar o agendamento. Por favor, tente novamente ou digite *0* para voltar ao menu principal.');
                        resetState(from);
                        return;
                    }
                    // Mantém o barber_id e data para remarcação
                    state.barber_id = state.selectedAppointment.barber_id;
                    state.barber_name = (barbers.find(b => b.id === state.barber_id) || {}).nome;
                    advanceState(from, 'reschedule_date');
                    const diasDisponiveis = Array.from({ length: 7 }, (_, i) => moment().add(i, 'days')).filter(d => d.isSameOrAfter(moment(), 'day'));
                    let listaDias = '📅 Ótimo! Agora escolha o novo dia para o seu agendamento:\n\n';
                    diasDisponiveis.forEach((d, i) => {
                        listaDias += `*${i + 1}* - ${d.format('dddd, DD/MM')}\n`;
                    });
                    listaDias += '\n*0* - 🔙 Voltar';
                    state.availableDates = diasDisponiveis.map(d => d.format('YYYY-MM-DD'));
                    await reply(listaDias);
                    return;
                }
                if (text === '2') {
                    // Cancelar
                    const appointmentId = state.selectedAppointment?.id;
                    if (!appointmentId) {
                        await reply('❌ Desculpe, não consegui encontrar o agendamento para cancelar. Por favor, tente novamente ou digite *0* para voltar ao menu principal.');
                        resetState(from);
                        return;
                    }
                    try {
                        await apiClient.delete(`/appointments/${appointmentId}`);
                        await reply('✅ Agendamento cancelado com sucesso.');
                    } catch (err) {
                        await reply('❌ Ocorreu um erro ao cancelar o agendamento. Por favor, tente novamente mais tarde.');
                    }
                    resetState(from);
                    return;
                }
                if (text === '3') {
                    // Agendar novo (a partir do reminder_options)
                    let list = 'Qual barbeiro você prefere?\n\n';
                    barbers.forEach(b => list += `*${b.id}* - ${b.nome}\n`);
                    list += '\n*0* - 🔙 Voltar';
                    advanceState(from, 'barber');
                    await reply(list);
                    return;
                }
            }

            if (state.step === 'manage_select_appointment') {
                const choice = parseInt(text);
                if (choice > 0 && choice <= state.appointments.length) {
                    state.selectedAppointment = state.appointments[choice - 1];
                    advanceState(from, 'manage_select_action');
                    await reply(`O que deseja fazer com o agendamento de ${moment(state.selectedAppointment.data_hora).format('DD/MM [às] HH:mm')}?\n\n*1* - 🔄 Remarcar\n*2* - ❌ Cancelar\n\n*0* - 🔙 Voltar`);
                    return;
                }
            }

            // ===== FLUXO DE AGENDAMENTO (novo ou remarcação) =====
            if (state.step === 'barber' || state.step === 'reschedule_barber') {
                const choice = parseInt(text);
                const selectedBarber = barbers.find(b => b.id === choice);
                if (selectedBarber) {
                    state.barber_id = selectedBarber.id;
                    state.barber_name = selectedBarber.nome;
                    advanceState(from, state.step === 'reschedule_barber' ? 'reschedule_date' : 'date');
                    const diasDisponiveis = Array.from({ length: 7 }, (_, i) => moment().add(i, 'days')).filter(d => d.isSameOrAfter(moment(), 'day'));
                    let listaDias = '📅 Ótimo! Agora escolha o dia:\n\n';
                    diasDisponiveis.forEach((d, i) => {
                        listaDias += `*${i + 1}* - ${d.format('dddd, DD/MM')}\n`;
                    });
                    listaDias += '\n*0* - 🔙 Voltar';
                    state.availableDates = diasDisponiveis.map(d => d.format('YYYY-MM-DD'));
                    await reply(listaDias);
                    return;
                }
            }

            if (state.step === 'date' || state.step === 'reschedule_date') {
                const choice = parseInt(text);
                if (choice > 0 && choice <= state.availableDates.length) {
                    state.date = state.availableDates[choice - 1];
                    advanceState(from, state.step === 'reschedule_date' ? 'reschedule_time' : 'time');
                    const times = await getAvailableTimes(state.barber_id, state.date);
                    if (times.length === 0) {
                        await reply('❌ Nenhum horário disponível para este dia com este barbeiro. Por favor, digite *0* para escolher outro dia ou *0* novamente para escolher outro barbeiro.');
                        goBackState(from);
                        goBackState(from);
                        return;
                    }
                    let listTimes = `⏰ Perfeito! Horários disponíveis para ${moment(state.date).format('DD/MM')}:\n\n`;
                    times.forEach((t, i) => listTimes += `*${i + 1}* - ${t}\n`);
                    listTimes += '\n*0* - 🔙 Voltar';
                    state.availableTimes = times;
                    await reply(listTimes);
                    return;
                }
            }

            if (state.step === 'time' || state.step === 'reschedule_time') {
                const choice = parseInt(text);
                if (choice > 0 && choice <= state.availableTimes.length) {
                    state.time = state.availableTimes[choice - 1];
                    advanceState(from, state.step === 'reschedule_time' ? 'reschedule_confirm' : 'confirm');
                    await reply(`✅ Por favor, confirme os detalhes:\n\n*Barbeiro:* ${state.barber_name}\n*Data:* ${moment(state.date).format('dddd, DD/MM/YYYY')}\n*Horário:* ${state.time}\n\n*1* - 👍 Confirmar\n*0* - 👎 Cancelar`);
                    return;
                }
            }

            if (state.step === 'confirm' || state.step === 'reschedule_confirm') {
                if (text === '1') {
                    const appointmentData = {
                        barber_id: state.barber_id,
                        cliente_numero: fromNumber,
                        cliente_nome: msg.pushName || 'Cliente',
                        data_hora: `${state.date} ${state.time}:00`,
                        // Aqui você pode adicionar outros campos, como serviço, se necessário
                    };
                    try {
                        if (state.step === 'reschedule_confirm') {
                            await apiClient.put(`/appointments/${state.selectedAppointment.id}`, appointmentData);
                            await reply('✅ Agendamento remarcado com sucesso!');
                        } else {
                            await apiClient.post('/appointments', appointmentData);
                            await reply('✅ Agendamento criado com sucesso!');
                        }
                    } catch (err) {
                        console.error('❌ Erro ao salvar agendamento na API:', err);
                        await reply('❌ Ocorreu um erro ao salvar seu agendamento. Por favor, tente novamente mais tarde.');
                    }
                    resetState(from);
                    return;
                }
                if (text === '0') {
                    await reply('❌ Agendamento cancelado. Volte quando quiser!');
                    resetState(from);
                    return;
                }
            }

        } catch (error) {
            console.error('❌ Erro no fluxo do chatbot:', error);
            await reply('❌ Desculpe, algo deu errado. Por favor, digite "oi" para recomeçar.');
            resetState(from);
        }
    });
}

// Inicia o bot e o servidor web
connectToWhatsApp();
app.get('/qrcode', (req, res) => {
    if (connectionState === 'qr' && qrCodeImage) {
        res.json({ status: 'qr', content: qrCodeImage });
    } else if (connectionState === 'connected') {
        res.json({ status: 'connected' });
    } else if (connectionState === 'disconnected') {
        res.json({ status: 'disconnected' });
    } else {
        res.json({ status: 'loading' });
    }
});


app.listen(PORT, () => {
    console.log(`🚀 Servidor Express rodando na porta ${PORT}`);
    console.log(`🌐 Acesse http://localhost:${PORT}/qrcode para ver o QR Code.`);
});