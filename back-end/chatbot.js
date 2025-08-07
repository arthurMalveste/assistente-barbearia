/*
 * chatbot.js - Versão Profissional Refatorada
 * Supervisor: Gemini AI
 * Data da Revisão: 31/07/2025
 *
 * ######################################################################################
 * ##                                                                                ##
 * ##  Este arquivo foi completamente reescrito para usar @whiskeysockets/baileys.   ##
 * ##  Esta mudança elimina a dependência do Puppeteer/Chrome, resolvendo problemas  ##
 * ##  de compatibilidade (Windows 11, VPS Linux) e melhorando drasticamente a       ##
 * ##  performance e o consumo de memória. A lógica de negócio original foi mantida. ##
 * ##                                                                                ##
 * ######################################################################################
 */

// --- Módulos Principais ---
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino'); // Logger recomendado pelo Baileys
const QRCode = require('qrcode');
const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const axios = require('axios');
const moment = require('moment');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs/promises'); // Adicionado para manipulação de arquivos de sessão

// --- Configuração Inicial ---
require('moment/locale/pt-br');
moment.locale('pt-br');

const app = express();
const port = 3005;

// --- Otimização: Conexão Única com o Banco de Dados ---
const dbPath = path.resolve(__dirname, 'db', 'barbearia.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ [DATABASE] Erro fatal ao conectar ao banco de dados SQLite:', err.message);
        process.exit(1); // Encerra a aplicação se não puder conectar ao DB
    } else {
        console.log('✅ [DATABASE] Conectado com sucesso ao banco de dados SQLite.');
    }
});

// --- Middlewares do Express ---
app.use(cors()); // Permite requisições de outras origens (seu front-end)
app.use(express.json()); // Permite ao Express entender JSON no corpo das requisições

// --- Variáveis de Estado do Bot ---
let sock;
let qrCodeImage = null;
let connectionState = 'starting'; // Estados: starting, qr, connected, disconnected
const userState = {}; // Armazena o estado da conversa de cada usuário

// Path para as credenciais do Baileys
const authInfoPath = 'baileys_auth_info';


let axiosInstance = null;

async function main() {
    try {
        const loginRes = await axios.post('http://localhost:3000/auth/login', {
            email: process.env.BARBEARIA_EMAIL,
            senha: process.env.BARBEARIA_SENHA
        });

        const JWT_TOKEN = loginRes.data.token;

        axiosInstance = axios.create({
            baseURL: 'http://localhost:3000',
            headers: {
                Authorization: `Bearer ${JWT_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        // Inicia o servidor web e o WhatsApp
        app.listen(port, () => {
            console.log(`🌐 Servidor web iniciado na porta ${port}`);
            console.log(`Acesse http://localhost:${port}/qrcode para ver o QR Code.`);
            connectToWhatsApp(); // Agora é chamado aqui após o login
        });

    } catch (err) {
        console.error('❌ [LOGIN] Erro ao tentar autenticar com o servidor:', err.message);
        process.exit(1);
    }
}

main();


// ##################################################################
// ##               FUNÇÕES AUXILIARES E DE NEGÓCIO                ##
// ##################################################################

// Reseta o estado de um usuário para o menu inicial
function resetState(from) {
    userState[from] = {
        step: 'menu',
        history: [], // ADICIONADO: Histórico de estados para navegação "voltar"
        barber_id: null,
        barber_name: null,
        date: null,
        time: null,
        appointments: [],
        selectedAppointment: null
    };
}

// Função para avançar no estado, salvando o estado atual no histórico
function advanceState(from, nextStep) {
    const state = userState[from];
    // Evita adicionar o mesmo estado repetidamente e 'menu' no histórico
    if (state.step !== nextStep && state.step !== 'menu') {
        state.history.push(state.step);
    }
    state.step = nextStep;
    console.log(`[STATE] ${from} - Avançando para: ${nextStep}. Histórico: ${state.history}`); // Para debug
}

// Função para retroceder um estado
function goBackState(from) {
    const state = userState[from];
    if (state.history.length > 0) {
        state.step = state.history.pop(); // Remove e retorna o último estado
    } else {
        state.step = 'menu'; // Se não há histórico, volta para o menu principal
    }
    console.log(`[STATE] ${from} - Voltando para: ${state.step}. Histórico: ${state.history}`); // Para debug
}

// Busca barbeiros da API (server.js)
async function getBarbers() {
    const res = await axiosInstance.get('http://localhost:3000/barbers');
    return res.data;
}

// --- Busca agendamentos de um cliente específico ---
async function getClientAppointments(phone) {
    const res = await axiosInstance.get('http://localhost:3000/appointments');
    // Garante que a comparação de números seja robusta
    return res.data.filter(a => a.cliente_numero && a.cliente_numero.includes(phone));
}

// Busca horários disponíveis para um barbeiro em uma data
async function getAvailableTimes(barber_id, date) {
    const res = await axiosInstance.get('http://localhost:3000/appointments');
    const booked = res.data
        .filter(a => a.barber_id == barber_id && a.data_hora.startsWith(date))
        .map(a => moment(a.data_hora).format('HH:mm'));

    const allTimes = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];
    return allTimes.filter(t => !booked.includes(t));
}

// Busca uma configuração específica do banco de dados
async function getConfig(chave) {
    return new Promise((resolve, reject) => {
        db.get("SELECT valor FROM config WHERE chave = ?", [chave], (err, row) => {
            if (err) return reject(err);
            resolve(row ? row.valor : null);
        });
    });
}

// ##################################################################
// ##               NOVA FUNÇÃO: getMenuMessageForState            ##
// ##################################################################
// Esta função é essencial para reconstruir a mensagem do menu do estado anterior.
// Você precisará mantê-la atualizada conforme adiciona novos passos.
async function getMenuMessageForState(step, state) {
    switch (step) {
        case 'menu':
            return '👋 Olá! Sou o assistente virtual da Barbearia. Escolha uma opção:\n\n*1* - 📅 Agendar um horário\n*2* - 💈 Ver serviços e valores\n*3* - 📌 Ver nossa localização\n*4* - 🔄 Remarcar ou Cancelar um horário';
        case 'reminder_options':
            // Esta parte assume que 'nextAppointment' e 'barber' estariam no estado
            // Para simplicidade, podemos redirecionar ou dar um menu mais genérico
            return 'O que deseja fazer?\n*1* - 🔄 Remarcar este horário\n*2* - ❌ Cancelar este horário\n*3* - 📅 Agendar um novo horário\n*0* - 🔙 Voltar';
        case 'manage_select_appointment':
            // Re-gerar a lista de agendamentos é complexo aqui sem re-chamar getClientAppointments
            // Uma mensagem mais genérica é ok para o "voltar" aqui
            const appointments = await getClientAppointments(state.selectedAppointment ? state.selectedAppointment.cliente_numero : state.fromNumber); // Tenta usar o número do cliente
            const futureAppointments = appointments.filter(a => moment(a.data_hora).isAfter(moment()));
            state.appointments = futureAppointments; // Atualiza para o caso de ter mudado
            let list = 'Você tem os seguintes agendamentos:\n';
            const barbers = await getBarbers();
            state.appointments.forEach((a, i) => {
                const barber = barbers.find(b => b.id === a.barber_id);
                list += `\n*${i + 1}* - ${barber ? barber.nome : 'Barbeiro'} em ${moment(a.data_hora).format('ddd, DD/MM [às] HH:mm')}`;
            });
            return list + '\n\nDigite o número do agendamento que deseja gerenciar ou *0* para voltar.';
        case 'manage_select_action':
            return `O que deseja fazer com o agendamento de ${moment(state.selectedAppointment.data_hora).format('DD/MM [às] HH:mm')}?\n\n*1* - 🔄 Remarcar\n*2* - ❌ Cancelar\n\n*0* - 🔙 Voltar`;
        case 'barber':
        case 'reschedule_barber':
            const allBarbers = await getBarbers();
            let listBarbers = 'Qual barbeiro você prefere?\n\n';
            allBarbers.forEach(b => listBarbers += `*${b.id}* - ${b.nome}\n`);
            listBarbers += '\n*0* - 🔙 Voltar ao menu';
            return listBarbers;
        case 'date':
        case 'reschedule_date':
            const diasDisponiveis = Array.from({ length: 7 }, (_, i) => moment().add(i, 'days'));
            let listaDias = '📅 Ótimo! Agora escolha o dia:\n\n';
            diasDisponiveis.forEach((d, i) => {
                listaDias += `*${i + 1}* - ${d.format('dddd, DD/MM')}\n`;
            });
            listaDias += '\n*0* - 🔙 Voltar';
            // Re-define availableDates para que o usuário possa selecionar novamente
            state.availableDates = diasDisponiveis.map(d => d.format('YYYY-MM-DD'));
            return listaDias;
        case 'time':
        case 'reschedule_time':
            // Requer recarregar os horários disponíveis para ser exato no "voltar"
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
            state.availableTimes = times; // Atualiza a lista de horários no estado
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
    // Certifique-se de que 'state' e 'saveCreds' são obtidos do caminho correto
    const { state, saveCreds } = await useMultiFileAuthState(authInfoPath);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`🔌 [BAILEYS] Usando versão: ${version.join('.')}, é a mais recente: ${isLatest}`);

    sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }), // Use 'debug' para logs detalhados
        printQRInTerminal: false,
        auth: state,
        browser: ['Bot-Barbearia', 'Chrome', '1.0.0']
    });

    // --- Tratamento de Eventos da Conexão ---
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('📌 [QRCODE] Novo QR Code gerado. Escaneie pela página web.');
            qrCodeImage = await QRCode.toDataURL(qr);
            connectionState = 'qr';
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(`❌ [CONNECTION] Conexão fechada: ${lastDisconnect.error}, reconectando: ${shouldReconnect}`);
            qrCodeImage = null;
            connectionState = 'disconnected';

            // --- Adição para lidar com credenciais inválidas e forçar novo QR Code ---
            if (lastDisconnect.error instanceof Boom) {
                const statusCode = lastDisconnect.error.output.statusCode;
                // Se o motivo do desconecte for sessão expirada ou logoff (manualmente desconectado)
                if (statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.badSession) {
                    console.log('🗑️ [AUTH] Sessão inválida ou desconectada. Removendo credenciais para forçar novo QR Code.');
                    try {
                        await fs.rm(authInfoPath, { recursive: true, force: true });
                        console.log('✅ [AUTH] Credenciais antigas removidas com sucesso.');
                    } catch (err) {
                        console.error('❌ [AUTH] Erro ao remover credenciais antigas:', err);
                    }
                }
            }
            // --- Fim da adição ---

            if (shouldReconnect) {
                setTimeout(connectToWhatsApp, 5000); // Tenta reconectar após 5 segundos
            } else {
                console.log('🚫 [CONNECTION] Não reconectando automaticamente. Motivo: loggedOut ou badSession. Você precisa reiniciar o bot para obter um novo QR Code.');
                // Se não deve reconectar automaticamente, pode ser útil sair ou aguardar
                // uma ação manual (ex: reiniciar o processo do Node).
                // process.exit(0); // Opcional: para encerrar o bot e forçar reinício manual
            }
        } else if (connection === 'open') {
            console.log('✅ [CONNECTION] Cliente WhatsApp conectado com sucesso!');
            qrCodeImage = null;
            connectionState = 'connected';
        }
    });

    // Salva a sessão sempre que as credenciais são atualizadas
    sock.ev.on('creds.update', saveCreds);

    // --- Tratamento de Mensagens Recebidas ---
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];

        // --- Filtros para ignorar mensagens irrelevantes ---
        if (!msg.message || msg.key.fromMe || msg.key.remoteJid.endsWith('@g.us')) {
            return;
        }

        const from = msg.key.remoteJid;
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim().toLowerCase();
        const fromNumber = from.split('@')[0]; // Número puro do cliente

        // Se o usuário não tem um estado, inicializa
        if (!userState[from]) {
            resetState(from);
        }

        const state = userState[from];
        state.fromNumber = fromNumber; // Armazena o número no estado para fácil acesso na função de menu
        const reply = async (message) => await sock.sendMessage(from, { text: message });

        // ##################################################################
        // ##              MÁQUINA DE ESTADOS DA CONVERSA                  ##
        // ##################################################################

        try {
            // Tratamento global para "0" ou "voltar"
            if (text === '0' || text === 'voltar') {
                if (state.step === 'menu' && state.history.length === 0) { // Já está no menu inicial sem histórico
                    await reply('Você já está no menu principal. Escolha uma opção ou diga "oi" para ver o menu novamente.');
                } else {
                    goBackState(from);
                    // Reconstroi a mensagem do estado anterior para guiar o usuário
                    await reply(`Ok, voltando. ${await getMenuMessageForState(state.step, state)}`);
                }
                return; // Importante para não processar a mensagem no fluxo normal
            }

            // ===== MENU PRINCIPAL E SAUDAÇÃO =====
            if (state.step === 'menu') {
                if (['oi', 'olá', 'ola', 'menu', 'oi!', 'ola!'].includes(text)) {
                    const appointments = await getClientAppointments(fromNumber);
                    const futureAppointments = appointments.filter(a => moment(a.data_hora).isAfter(moment()));

                    // CASO 1: Nenhum agendamento futuro
                    if (futureAppointments.length === 0) {
                        await reply('👋 Olá! Sou o assistente virtual da Barbearia. Escolha uma opção:\n\n*1* - 📅 Agendar um horário\n*2* - 💈 Ver serviços e valores\n*3* - 📌 Ver nossa localização\n*4* - 🔄 Gerenciar agendamentos (se houver)');
                        return;
                    }

                    // Ordena os agendamentos por data
                    futureAppointments.sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));
                    state.appointments = futureAppointments;

                    // CASO 2: Exatamente UM agendamento futuro (comportamento antigo mantido)
                    if (futureAppointments.length === 1) {
                        const nextAppointment = futureAppointments[0];
                        const barber = (await getBarbers()).find(b => b.id === nextAppointment.barber_id);
                        advanceState(from, 'reminder_options');
                        
                        await reply(
                            `👋 Olá! Você já tem um agendamento no dia ${moment(nextAppointment.data_hora).format('DD/MM')} às ${moment(nextAppointment.data_hora).format('HH:mm')} com o barbeiro ${barber ? barber.nome : 'desconhecido'}.\n\n` +
                            `O que deseja fazer?\n*1* - 🔄 Remarcar este horário\n*2* - ❌ Cancelar este horário\n*3* - 📅 Agendar um novo horário\n*0* - 🔙 Voltar`
                        );
                        return;
                    }

                    // CASO 3: MAIS DE UM agendamento futuro (novo fluxo)
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
                    const barbers = await getBarbers();
                    let list = 'Qual barbeiro você prefere?\n\n';
                    barbers.forEach(b => list += `*${b.id}* - ${b.nome}\n`);
                    list += '\n*0* - 🔙 Voltar';
                    advanceState(from, 'barber'); // <-- Usar advanceState
                    await reply(list);
                    return;
                }
                if (text === '2') {
                    const descricao = await getConfig('descricao') || 'Informação sobre valores não disponível no momento.';
                    await reply(descricao);
                    resetState(from); // Volta para o menu após exibir a informação
                    return;
                }
                if (text === '3') {
                    const endereco = await getConfig('endereco') || 'Endereço não disponível no momento.';
                    await reply(endereco);
                    resetState(from); // Volta para o menu após exibir a informação
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
                    const barbers = await getBarbers();
                    state.appointments.forEach((a, i) => {
                        const barber = barbers.find(b => b.id === a.barber_id);
                        list += `\n*${i + 1}* - ${barber ? barber.nome : 'Barbeiro'} em ${moment(a.data_hora).format('ddd, DD/MM [às] HH:mm')}`;
                    });

                    advanceState(from, 'manage_select_appointment'); // <-- Usar advanceState
                    await reply(list + '\n\nDigite o número do agendamento que deseja gerenciar ou *0* para voltar.');
                    return;
                }
            }
            // ===== NOVO FLUXO: MENU PARA MÚLTIPLOS AGENDAMENTOS =====
            if (state.step === 'multi_appointment_menu') {
                const barbers = await getBarbers();

                // 1 - Ver meus horários
                if (text === '1') {
                    let list = '🗓️ Estes são seus próximos agendamentos:\n';
                    state.appointments.forEach((a) => {
                        const barber = barbers.find(b => b.id === a.barber_id);
                        list += `\n- Com *${barber ? barber.nome : 'Barbeiro'}* em ${moment(a.data_hora).format('dddd, DD/MM/YYYY [às] HH:mm')}`;
                    });
                    
                    // Envia a lista e depois o menu de opções novamente para o usuário não ficar preso
                    await reply(list);
                    await reply(`O que você gostaria de fazer agora?\n` +
                                `*1* - 🗒️ Ver meus horários\n` +
                                `*2* - 🔄 Remarcar um horário\n` +
                                `*3* - ❌ Cancelar um horário\n` +
                                `*4* - 📅 Agendar um novo horário\n` +
                                `*0* - 🔙 Sair`);
                    return;
                }
                
                // 2 - Remarcar ou 3 - Cancelar (ambos levam para o mesmo fluxo de seleção)
                if (text === '2' || text === '3') {
                    let list = 'Ok. Qual destes agendamentos você deseja gerenciar?\n';
                    state.appointments.forEach((a, i) => {
                        const barber = barbers.find(b => b.id === a.barber_id);
                        list += `\n*${i + 1}* - Com *${barber ? barber.nome : 'Barbeiro'}* em ${moment(a.data_hora).format('DD/MM [às] HH:mm')}`;
                    });
                    
                    // REUTILIZANDO o fluxo de gerenciamento já existente
                    advanceState(from, 'manage_select_appointment'); 
                    await reply(list + '\n\nDigite o número do agendamento ou *0* para voltar.');
                    return;
                }

                // 4 - Agendar um novo horário
                if (text === '4') {
                    let list = 'Ok, vamos agendar um novo horário. Qual barbeiro você prefere?\n\n';
                    barbers.forEach(b => list += `*${b.id}* - ${b.nome}\n`);
                    list += '\n*0* - 🔙 Voltar';
                    
                    // REUTILIZANDO o fluxo de agendamento já existente
                    advanceState(from, 'barber'); 
                    await reply(list);
                    return;
                }
                
                // Opção de Sair tratada pelo "0" global. Se digitar algo inválido:
                await reply('❌ Opção inválida. Por favor, escolha um número do menu acima.');
                return;
            }

            // ===== FLUXO DE OPÇÕES DO LEMBRETE INICIAL =====
            if (state.step === 'reminder_options') {
                // "0" ou "voltar" já é tratado globalmente
                if (text === '1') { // Remarcar
                    state.selectedAppointment = state.appointments[0];
                    advanceState(from, 'reschedule_barber'); // <-- Usar advanceState
                    const barbers = await getBarbers();
                    let list = 'Com qual barbeiro você gostaria de remarcar?\n\n';
                    barbers.forEach(b => list += `*${b.id}* - ${b.nome}\n`);
                    list += '\n*0* - 🔙 Cancelar';
                    await reply(list);
                    return;
                }
                if (text === '2') { // Cancelar
                    const appt = state.appointments[0];
                    await axiosInstance.delete(`http://localhost:3000/appointments/${appt.id}`);
                    await reply(`✅ Agendamento do dia ${moment(appt.data_hora).format('DD/MM [às] HH:mm')} foi cancelado com sucesso.`);
                    resetState(from); // Após a ação, volta ao menu principal
                    return;
                }
                if (text === '3') { // Agendar outro
                    advanceState(from, 'barber'); // <-- Usar advanceState
                    const barbers = await getBarbers();
                    let list = 'Ok. Qual barbeiro você prefere para o novo agendamento?\n\n';
                    barbers.forEach(b => list += `*${b.id}* - ${b.nome}\n`);
                    list += '\n*0* - 🔙 Voltar ao menu';
                    await reply(list);
                    return;
                }
                await reply('❌ Opção inválida. Por favor, escolha uma das opções acima ou *0* para voltar.');
                return;
            }

            // ===== FLUXO DE GERENCIAMENTO (ESCOLHA DO AGENDAMENTO) =====
            if (state.step === 'manage_select_appointment') {
                // "0" ou "voltar" já é tratado globalmente
                const index = parseInt(text) - 1;
                if (isNaN(index) || !state.appointments[index]) {
                    await reply('❌ Opção inválida. Escolha um número da lista ou *0* para voltar.');
                    return;
                }
                state.selectedAppointment = state.appointments[index];
                advanceState(from, 'manage_select_action'); // <-- Usar advanceState
                await reply(`O que deseja fazer com o agendamento de ${moment(state.selectedAppointment.data_hora).format('DD/MM [às] HH:mm')}?\n\n*1* - 🔄 Remarcar\n*2* - ❌ Cancelar\n\n*0* - 🔙 Voltar`);
                return;
            }

            // ===== FLUXO DE GERENCIAMENTO (ESCOLHA DA AÇÃO) =====
            if (state.step === 'manage_select_action') {
                // "0" ou "voltar" já é tratado globalmente
                if (text === '1') { // Remarcar
                    advanceState(from, 'reschedule_barber'); // <-- Usar advanceState
                    const barbers = await getBarbers();
                    let list = 'Com qual barbeiro você gostaria de remarcar?\n\n';
                    barbers.forEach(b => list += `*${b.id}* - ${b.nome}\n`);
                    list += '\n*0* - 🔙 Cancelar';
                    await reply(list);
                    return;
                }
                if (text === '2') { // Cancelar
                    await axiosInstance.delete(`http://localhost:3000/appointments/${state.selectedAppointment.id}`);
                    await reply(`✅ Agendamento do dia ${moment(state.selectedAppointment.data_hora).format('DD/MM [às] HH:mm')} foi cancelado com sucesso.`);
                    resetState(from); // Após a ação, volta ao menu principal
                    return;
                }
                await reply('❌ Opção inválida. Escolha 1 para remarcar ou 2 para cancelar, ou *0* para voltar.');
                return;
            }

            // ===== FLUXO UNIFICADO DE ESCOLHA DE BARBEIRO (AGENDAR E REMARCAR) =====
            const barberStep = state.step === 'barber' || state.step === 'reschedule_barber';
            if (barberStep) {
                // "0" ou "voltar" já é tratado globalmente

                const barbers = await getBarbers();
                const selected = barbers.find(b => b.id == text);
                if (!selected) {
                    await reply('❌ Barbeiro inválido. Por favor, escolha um número da lista ou *0* para voltar.');
                    return;
                }

                state.barber_id = selected.id;
                state.barber_name = selected.nome;

                const diasDisponiveis = Array.from({ length: 7 }, (_, i) => moment().add(i, 'days'));
                let listaDias = '📅 Ótimo! Agora escolha o dia:\n\n';
                diasDisponiveis.forEach((d, i) => {
                    listaDias += `*${i + 1}* - ${d.format('dddd, DD/MM')}\n`;
                });
                listaDias += '\n*0* - 🔙 Voltar';

                advanceState(from, state.step === 'barber' ? 'date' : 'reschedule_date'); // <-- Usar advanceState
                state.availableDates = diasDisponiveis.map(d => d.format('YYYY-MM-DD'));

                await reply(listaDias);
                return;
            }

            // ===== FLUXO UNIFICADO DE ESCOLHA DE DATA (AGENDAR E REMARCAR) =====
            const dateStep = state.step === 'date' || state.step === 'reschedule_date';
            if (dateStep) {
                // "0" ou "voltar" já é tratado globalmente

                const index = parseInt(text) - 1;
                if (isNaN(index) || !state.availableDates[index]) {
                    await reply('❌ Dia inválido. Por favor, escolha um número da lista ou *0* para voltar.');
                    return;
                }
                state.date = state.availableDates[index];

                const times = await getAvailableTimes(state.barber_id, state.date);
                if (times.length === 0) {
                    await reply('❌ Nenhum horário disponível para este dia com este barbeiro. Por favor, digite *0* para escolher outro dia ou *0* novamente para escolher outro barbeiro.');
                    return;
                }

                let list = `⏰ Perfeito! Horários disponíveis para ${moment(state.date).format('DD/MM')}:\n\n`;
                times.forEach((t, i) => list += `*${i + 1}* - ${t}\n`);
                list += '\n*0* - 🔙 Voltar';

                advanceState(from, state.step === 'date' ? 'time' : 'reschedule_time'); // <-- Usar advanceState
                state.availableTimes = times;
                await reply(list);
                return;
            }

            // ===== FLUXO UNIFICADO DE ESCOLHA DE HORÁRIO (AGENDAR E REMARCAR) =====
            const timeStep = state.step === 'time' || state.step === 'reschedule_time';
            if (timeStep) {
                // "0" ou "voltar" já é tratado globalmente

                const index = parseInt(text) - 1;
                if (isNaN(index) || !state.availableTimes[index]) {
                    await reply('❌ Horário inválido. Escolha um número da lista ou *0* para voltar.');
                    return;
                }
                state.time = state.availableTimes[index];

                const now = moment().seconds(0).milliseconds(0);
const dataHoraEscolhida = moment(`${state.date} ${state.time}`, 'YYYY-MM-DD HH:mm').seconds(0).milliseconds(0);

if (dataHoraEscolhida.isBefore(now)) {
  await reply('❌ Você não pode agendar para um horário que já passou. Por favor, escolha outro horário ou *0* para voltar.');
  return;
}

                advanceState(from, state.step === 'time' ? 'confirm' : 'reschedule_confirm'); // <-- Usar advanceState
                await reply(
                    `✅ Por favor, confirme os detalhes:\n\n` +
                    `*Barbeiro:* ${state.barber_name}\n` +
                    `*Data:* ${moment(state.date).format('dddd, DD/MM/YYYY')}\n` +
                    `*Horário:* ${state.time}\n\n` +
                    `*1* - 👍 Confirmar\n*0* - 👎 Cancelar`
                );
                return;
            }

            // ===== CONFIRMAÇÃO FINAL DE AGENDAMENTO =====
            if (state.step === 'confirm') {
                // "0" ou "voltar" já é tratado globalmente

                if (text === '1') {
                    try {
                        const nomeCliente = msg.pushName || 'Cliente WhatsApp';
                        await axiosInstance.post('http://localhost:3000/appointments', {
                            barber_id: state.barber_id,
                            cliente_nome: nomeCliente,
                            cliente_numero: fromNumber,
                            data_hora: `${state.date} ${state.time}`
                        });
                        await reply(`✅ Show! Seu agendamento foi confirmado para ${moment(state.date).format('DD/MM')} às ${state.time} com ${state.barber_name}. Até lá!`);
                     } catch (err) {
                        if (err.response && err.response.status === 409) {
                            await reply('❌ Ops! Este horário acabou de ser ocupado por outra pessoa. Por favor, digite *0* para voltar e tentar novamente escolhendo outro horário.');
                        } else {
                            await reply('❌ Ocorreu um erro ao salvar seu agendamento. Por favor, tente novamente em alguns instantes. Se o problema persistir, contate o suporte.');
                            console.error("Erro ao agendar:", err);
                        }
                    }
                    resetState(from); // Conclui o fluxo e volta ao menu principal
                    return;
                }
                await reply('❌ Opção inválida. Digite *1* para confirmar ou *0* para cancelar.');
                return;
            }

            // ===== CONFIRMAÇÃO FINAL DE REMARCAÇÃO =====
            if (state.step === 'reschedule_confirm') {
                // "0" ou "voltar" já é tratado globalmente

                if (text === '1') {
                    try {
                        await axiosInstance.put(`http://localhost:3000/appointments/${state.selectedAppointment.id}`, {
                            barber_id: state.barber_id,
                            cliente_nome: state.selectedAppointment.cliente_nome,
                            cliente_numero: state.selectedAppointment.cliente_numero,
                            data_hora: `${state.date} ${state.time}`,
                            status: 'remarcado',
                            lembrete_enviado: false // Reseta o lembrete para a nova data
                        });
                        await reply(`✅ Agendamento remarcado com sucesso para ${moment(state.date).format('DD/MM')} às ${state.time} com ${state.barber_name}.`);
                    } catch (err) {
                        await reply('❌ Ocorreu um erro ao tentar remarcar. Por favor, tente novamente ou digite *0* para voltar.');
                        console.error("Erro ao remarcar:", err);
                    }
                    resetState(from); // Conclui o fluxo e volta ao menu principal
                    return;
                }
                await reply('❌ Opção inválida. Digite *1* para confirmar ou *0* para cancelar.');
                return;
            }

            // Se a mensagem não se encaixa em nenhum estado e não é o menu inicial
            if (state.step !== 'menu') {
                await reply('Não entendi. Por favor, escolha uma opção válida para o passo atual, ou digite *0* para voltar.');
                // Não reseta o estado aqui, permite que o usuário tente novamente ou use o "0" para voltar
            } else {
                // Se estiver no menu e a entrada for inválida
                await reply('Desculpe, não entendi. Por favor, diga "oi" ou escolha uma opção do menu:\n\n*1* - 📅 Agendar um horário\n*2* - 💈 Ver serviços e valores\n*3* - 📌 Ver nossa localização\n*4* - 🔄 Remarcar ou Cancelar um horário');
            }


        } catch (error) {
            console.error(`[ERROR_HANDLER] Erro ao processar mensagem do usuário ${fromNumber}:`, error);
            await reply("🤖 Desculpe, encontrei um erro interno. Tente novamente em instantes. Se o problema persistir, contate o suporte.");
            resetState(from);
        }
    });
}


// ##################################################################
// ##              ROTINA DE LEMBRETES (CRON)                      ##
// ##################################################################
cron.schedule('*/5 * * * *', async () => { // Roda a cada 5 minutos para mais precisão
    if (connectionState !== 'connected') {
        return; // Bot não está conectado, não faz nada
    }

    console.log('🔔 [CRON] Verificando agendamentos para enviar lembretes...');
    try {
        const { data: appointments } = await axiosInstance.get('http://localhost:3000/appointments');
        const now = moment();

        for (const appt of appointments) {
            // Se o lembrete já foi enviado (1) ou o status é 'cancelado', pula
            if (appt.lembrete_enviado || appt.status === 'cancelado') {
                continue;
            }

            const apptTime = moment(appt.data_hora);
            const oneHourBefore = apptTime.clone().subtract(1, 'hour');

            // Envia lembrete se estivermos na janela de 1 hora antes do agendamento
            if (now.isBetween(oneHourBefore, apptTime)) {
                const msg = `⏰ Olá, ${appt.cliente_nome}! Passando para lembrar do seu horário na barbearia hoje às *${apptTime.format('HH:mm')}*. Te esperamos!`;

                const clientJid = `${appt.cliente_numero}@s.whatsapp.net`;

                cron.schedule('*/5 * * * *', async () => {
    if (connectionState !== 'connected') return;

    console.log('🔔 [CRON] Verificando agendamentos para enviar lembretes...');
    try {
        const { data: appointments } = await axiosInstance.get('http://localhost:3000/appointments');
        const now = moment();

        for (const appt of appointments) {
            if (appt.lembrete_enviado || appt.status === 'cancelado') {
                continue;
            }

            const apptTime = moment(appt.data_hora);
            const oneHourBefore = apptTime.clone().subtract(1, 'hour');

            if (now.isBetween(oneHourBefore, apptTime)) {
                const clientJid = `${appt.cliente_numero}@s.whatsapp.net`;
                const msg = `⏰ Olá, ${appt.cliente_nome}! Passando para lembrar do seu horário na barbearia hoje às *${apptTime.format('HH:mm')}*. Te esperamos!`;

                // =================================================================
                // GUARDA DE SEGURANÇA E LOG DETALHADO - AQUI ESTÁ A MUDANÇA
                // =================================================================
                console.log(`[CRON_GUARD] Preparando lembrete para Appointment ID: ${appt.id}. Destinatário no DB: ${clientJid}. Mensagem: "${msg}"`);
                
                // Verificação extra de sanidade: não envia se o número for inválido/curto.
                if (!appt.cliente_numero || appt.cliente_numero.length < 10) {
                    console.error(`[CRON_FAIL] Lembrete para Appointment ID: ${appt.id} BLOQUEADO devido a número inválido: ${appt.cliente_numero}`);
                    continue; // Pula para o próximo agendamento
                }
                
                await sock.sendMessage(clientJid, { text: msg });
                console.log(`[CRON_SUCCESS] Lembrete para Appointment ID: ${appt.id} enviado com sucesso para ${clientJid}.`);

                await axiosInstance.put(`http://localhost:3000/appointments/${appt.id}`, {
                    ...appt,
                    lembrete_enviado: true
                });
            }
        }
    } catch (err) {
        console.error('❌ [CRON] Erro fatal ao executar a tarefa de lembretes:', err.message);
    }
});

                // Atualiza o status no banco para não enviar novamente
                await axiosInstance.put(`http://localhost:3000/appointments/${appt.id}`, { lembrete_enviado: true });
            }
        }
    } catch (error) {
        console.error('❌ [CRON] Erro ao enviar lembretes:', error.message);
    }
});

// ##################################################################
// ##              ROTAS DA API WEB (EXPRESS)                      ##
// ##################################################################

// Rota para obter o QR Code
app.get('/qrcode', (req, res) => {
    if (connectionState === 'qr' && qrCodeImage) {
        res.json({ status: 'qr', qrCode: qrCodeImage });
    } else if (connectionState === 'connected') {
        res.json({ status: 'connected', message: 'Bot já conectado.' });
    } else if (connectionState === 'disconnected') {
        res.status(500).json({ status: 'disconnected', message: 'Bot desconectado. Tente reiniciar o processo.' });
    } else {
        res.json({ status: connectionState, message: 'Aguardando QR Code ou conexão.' });
    }
});

// Rota para verificar o status da conexão
app.get('/status', (req, res) => {
    res.json({ status: connectionState });
});

// Inicia o servidor Express
app.listen(port, () => {
    console.log(`🌐 Servidor web iniciado na porta ${port}`);
    console.log(`Acesse http://localhost:${port}/qrcode para ver o QR Code.`);
    connectToWhatsApp(); // Inicia a conexão com o WhatsApp ao iniciar o servidor
});

// Inicializa a conexão com o WhatsApp
// connectToWhatsApp(); // Removido daqui, agora é chamado dentro do app.listen