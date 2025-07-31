/**
 * chatbot.js - Versão Profissional Refatorada
 * Supervisor: Gemini AI
 * Data da Revisão: 31/07/2025
 *
 * ######################################################################################
 * ##                                                                                  ##
 * ##  Este arquivo foi completamente reescrito para usar @whiskeysockets/baileys.     ##
 * ##  Esta mudança elimina a dependência do Puppeteer/Chrome, resolvendo problemas    ##
 * ##  de compatibilidade (Windows 11, VPS Linux) e melhorando drasticamente a         ##
 * ##  performance e o consumo de memória. A lógica de negócio original foi mantida.   ##
 * ##                                                                                  ##
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

// ##################################################################
// ##               FUNÇÕES AUXILIARES E DE NEGÓCIO                ##
// ##################################################################

// Reseta o estado de um usuário para o menu inicial
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

// Busca barbeiros da API (server.js)
async function getBarbers() {
    const res = await axios.get('http://localhost:3000/barbers');
    return res.data;
}

// Busca agendamentos de um cliente específico
async function getClientAppointments(phone) {
    const res = await axios.get('http://localhost:3000/appointments');
    // Garante que a comparação de números seja robusta
    return res.data.filter(a => a.cliente_numero.includes(phone));
}

// Busca horários disponíveis para um barbeiro em uma data
async function getAvailableTimes(barber_id, date) {
    const res = await axios.get('http://localhost:3000/appointments');
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
// ##              NÚCLEO DO BOT - CONEXÃO COM WHATSAPP             ##
// ##################################################################

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');
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
            if (shouldReconnect) {
                setTimeout(connectToWhatsApp, 5000); // Tenta reconectar após 5 segundos
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
        const reply = async (message) => await sock.sendMessage(from, { text: message });

        // ##################################################################
        // ##                 MÁQUINA DE ESTADOS DA CONVERSA               ##
        // ##################################################################
        // A lógica abaixo é a sua lógica original, com o método de resposta
        // trocado de 'msg.reply' para a nossa função 'reply' padronizada.

        try {
            // ===== MENU PRINCIPAL E SAUDAÇÃO =====
            if (state.step === 'menu') {
                if (['oi', 'olá', 'ola', 'menu', 'oi!', 'ola!'].includes(text)) {
                    const appointments = await getClientAppointments(fromNumber);
                    const futureAppointments = appointments.filter(a => moment(a.data_hora).isAfter(moment()));

                    if (futureAppointments.length > 0) {
                        futureAppointments.sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));
                        const nextAppointment = futureAppointments[0];
                        const barber = (await getBarbers()).find(b => b.id === nextAppointment.barber_id);
                        
                        state.step = 'reminder_options';
                        state.appointments = futureAppointments;
                        
                        await reply(
                            `👋 Olá! Você já tem um agendamento no dia ${moment(nextAppointment.data_hora).format('DD/MM')} às ${moment(nextAppointment.data_hora).format('HH:mm')} com o barbeiro ${barber ? barber.nome : 'desconhecido'}.\n\n` +
                            `O que deseja fazer?\n*1* - 🔄 Remarcar este horário\n*2* - ❌ Cancelar este horário\n*3* - 📅 Agendar um novo horário\n*0* - 🔙 Sair`
                        );
                        return;
                    }

                    await reply('👋 Olá! Sou o assistente virtual da Barbearia. Escolha uma opção:\n\n*1* - 📅 Agendar um horário\n*2* - 💈 Ver serviços e valores\n*3* - 📌 Ver nossa localização\n*4* - 🔄 Remarcar ou Cancelar um horário');
                    return;
                }

                if (text === '1') {
                    const barbers = await getBarbers();
                    let list = 'Qual barbeiro você prefere?\n\n';
                    barbers.forEach(b => list += `*${b.id}* - ${b.nome}\n`);
                    list += '\n*0* - 🔙 Voltar ao menu';
                    state.step = 'barber';
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
                    const barbers = await getBarbers();
                    state.appointments.forEach((a, i) => {
                        const barber = barbers.find(b => b.id === a.barber_id);
                        list += `\n*${i + 1}* - ${barber ? barber.nome : 'Barbeiro'} em ${moment(a.data_hora).format('ddd, DD/MM [às] HH:mm')}`;
                    });
                    
                    state.step = 'manage_select_appointment';
                    await reply(list + '\n\nDigite o número do agendamento que deseja gerenciar ou *0* para voltar.');
                    return;
                }
            }

            // ===== FLUXO DE OPÇÕES DO LEMBRETE INICIAL =====
            if (state.step === 'reminder_options') {
                 if (text === '0') { resetState(from); await reply('Ok, saindo. Envie "menu" para começar de novo.'); return; }
                 if (text === '1') { // Remarcar
                    state.selectedAppointment = state.appointments[0];
                    state.step = 'reschedule_barber';
                    const barbers = await getBarbers();
                    let list = 'Com qual barbeiro você gostaria de remarcar?\n\n';
                    barbers.forEach(b => list += `*${b.id}* - ${b.nome}\n`);
                    list += '\n*0* - 🔙 Cancelar';
                    await reply(list);
                    return;
                 }
                 if (text === '2') { // Cancelar
                    const appt = state.appointments[0];
                    await axios.delete(`http://localhost:3000/appointments/${appt.id}`);
                    await reply(`✅ Agendamento do dia ${moment(appt.data_hora).format('DD/MM [às] HH:mm')} foi cancelado com sucesso.`);
                    resetState(from);
                    return;
                 }
                 if (text === '3') { // Agendar outro
                    state.step = 'barber';
                    const barbers = await getBarbers();
                    let list = 'Ok. Qual barbeiro você prefere para o novo agendamento?\n\n';
                    barbers.forEach(b => list += `*${b.id}* - ${b.nome}\n`);
                    list += '\n*0* - 🔙 Voltar ao menu';
                    await reply(list);
                    return;
                 }
                 await reply('❌ Opção inválida. Por favor, escolha uma das opções acima.');
                 return;
            }

            // ===== FLUXO DE GERENCIAMENTO (ESCOLHA DO AGENDAMENTO) =====
            if (state.step === 'manage_select_appointment') {
                if (text === '0') { resetState(from); await reply('Ok, voltando ao menu. Envie "menu" para recomeçar.'); return; }
                const index = parseInt(text) - 1;
                if (isNaN(index) || !state.appointments[index]) {
                    await reply('❌ Opção inválida. Escolha um número da lista.');
                    return;
                }
                state.selectedAppointment = state.appointments[index];
                state.step = 'manage_select_action';
                await reply(`O que deseja fazer com o agendamento de ${moment(state.selectedAppointment.data_hora).format('DD/MM [às] HH:mm')}?\n\n*1* - 🔄 Remarcar\n*2* - ❌ Cancelar\n\n*0* - 🔙 Voltar`);
                return;
            }
            
            // ===== FLUXO DE GERENCIAMENTO (ESCOLHA DA AÇÃO) =====
            if (state.step === 'manage_select_action') {
                if (text === '0') { resetState(from); await reply('Ok, voltando ao menu. Envie "menu" para recomeçar.'); return; }
                if (text === '1') { // Remarcar
                    state.step = 'reschedule_barber';
                    const barbers = await getBarbers();
                    let list = 'Com qual barbeiro você gostaria de remarcar?\n\n';
                    barbers.forEach(b => list += `*${b.id}* - ${b.nome}\n`);
                    list += '\n*0* - 🔙 Cancelar';
                    await reply(list);
                    return;
                }
                if (text === '2') { // Cancelar
                    await axios.delete(`http://localhost:3000/appointments/${state.selectedAppointment.id}`);
                    await reply(`✅ Agendamento do dia ${moment(state.selectedAppointment.data_hora).format('DD/MM [às] HH:mm')} foi cancelado com sucesso.`);
                    resetState(from);
                    return;
                }
                await reply('❌ Opção inválida. Escolha 1 para remarcar ou 2 para cancelar.');
                return;
            }
            
            // ===== FLUXO UNIFICADO DE ESCOLHA DE BARBEIRO (AGENDAR E REMARCAR) =====
            const barberStep = state.step === 'barber' || state.step === 'reschedule_barber';
            if (barberStep) {
                if (text === '0') { resetState(from); await reply('Ok, cancelado. Envie "menu" para recomeçar.'); return; }
                
                const barbers = await getBarbers();
                const selected = barbers.find(b => b.id == text);
                if (!selected) {
                    await reply('❌ Barbeiro inválido. Por favor, escolha um número da lista.');
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

                state.step = state.step === 'barber' ? 'date' : 'reschedule_date';
                state.availableDates = diasDisponiveis.map(d => d.format('YYYY-MM-DD'));
                
                await reply(listaDias);
                return;
            }
            
            // ===== FLUXO UNIFICADO DE ESCOLHA DE DATA (AGENDAR E REMARCAR) =====
            const dateStep = state.step === 'date' || state.step === 'reschedule_date';
            if (dateStep) {
                if (text === '0') { resetState(from); await reply('Ok, cancelado. Envie "menu" para recomeçar.'); return; }
                
                const index = parseInt(text) - 1;
                if (isNaN(index) || !state.availableDates[index]) {
                    await reply('❌ Dia inválido. Por favor, escolha um número da lista.');
                    return;
                }
                state.date = state.availableDates[index];
                
                const times = await getAvailableTimes(state.barber_id, state.date);
                if (times.length === 0) {
                    state.step = state.step === 'date' ? 'barber' : 'reschedule_barber'; // Volta um passo
                    await reply('❌ Nenhum horário disponível para este dia com este barbeiro. Por favor, escolha outro dia ou volte para escolher outro barbeiro.');
                    return;
                }

                let list = `⏰ Perfeito! Horários disponíveis para ${moment(state.date).format('DD/MM')}:\n\n`;
                times.forEach((t, i) => list += `*${i + 1}* - ${t}\n`);
                list += '\n*0* - 🔙 Voltar';

                state.step = state.step === 'date' ? 'time' : 'reschedule_time';
                state.availableTimes = times;
                await reply(list);
                return;
            }

            // ===== FLUXO UNIFICADO DE ESCOLHA DE HORÁRIO (AGENDAR E REMARCAR) =====
            const timeStep = state.step === 'time' || state.step === 'reschedule_time';
            if (timeStep) {
                if (text === '0') { resetState(from); await reply('Ok, cancelado. Envie "menu" para recomeçar.'); return; }
                
                const index = parseInt(text) - 1;
                if (isNaN(index) || !state.availableTimes[index]) {
                    await reply('❌ Horário inválido. Escolha um número da lista.');
                    return;
                }
                state.time = state.availableTimes[index];

                const dataHoraEscolhida = moment(`${state.date} ${state.time}`, 'YYYY-MM-DD HH:mm');
                if (dataHoraEscolhida.isBefore(moment())) {
                    await reply('❌ Você não pode agendar para um horário que já passou. Por favor, escolha outro horário.');
                    return;
                }

                state.step = state.step === 'time' ? 'confirm' : 'reschedule_confirm';
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
                if (text === '0') { resetState(from); await reply('❌ Agendamento cancelado. Envie "menu" para recomeçar.'); return; }
                
                if (text === '1') {
                    try {
                        const nomeCliente = msg.pushName || 'Cliente WhatsApp';
                        await axios.post('http://localhost:3000/appointments', {
                            barber_id: state.barber_id,
                            cliente_nome: nomeCliente,
                            cliente_numero: fromNumber,
                            data_hora: `${state.date} ${state.time}`
                        });
                        await reply(`✅ Show! Seu agendamento foi confirmado para ${moment(state.date).format('DD/MM')} às ${state.time} com ${state.barber_name}. Até lá!`);
                    } catch (err) {
                        if (err.response && err.response.status === 409) {
                            await reply('❌ Ops! Este horário acabou de ser ocupado por outra pessoa. Por favor, tente novamente escolhendo outro horário.');
                        } else {
                            await reply('❌ Ocorreu um erro ao salvar seu agendamento. Por favor, tente novamente em alguns instantes.');
                            console.error("Erro ao agendar:", err);
                        }
                    }
                    resetState(from);
                    return;
                }
            }

            // ===== CONFIRMAÇÃO FINAL DE REMARCAÇÃO =====
            if (state.step === 'reschedule_confirm') {
                if (text === '0') { resetState(from); await reply('❌ Remarcação cancelada. Envie "menu" para recomeçar.'); return; }
                
                if (text === '1') {
                    try {
                        await axios.put(`http://localhost:3000/appointments/${state.selectedAppointment.id}`, {
                            barber_id: state.barber_id,
                            cliente_nome: state.selectedAppointment.cliente_nome,
                            cliente_numero: state.selectedAppointment.cliente_numero,
                            data_hora: `${state.date} ${state.time}`,
                            status: 'remarcado',
                            lembrete_enviado: false // Reseta o lembrete para a nova data
                        });
                        await reply(`✅ Agendamento remarcado com sucesso para ${moment(state.date).format('DD/MM')} às ${state.time} com ${state.barber_name}.`);
                    } catch (err) {
                        await reply('❌ Ocorreu um erro ao tentar remarcar. Por favor, tente novamente.');
                        console.error("Erro ao remarcar:", err);
                    }
                    resetState(from);
                    return;
                }
            }
        
        } catch(error) {
            console.error(`[ERROR_HANDLER] Erro ao processar mensagem do usuário ${fromNumber}:`, error);
            await reply("🤖 Desculpe, encontrei um erro interno. Tente novamente em instantes. Se o problema persistir, contate o suporte.");
            resetState(from);
        }
    });
}


// ##################################################################
// ##                   ROTINA DE LEMBRETES (CRON)                 ##
// ##################################################################
cron.schedule('*/5 * * * *', async () => { // Roda a cada 5 minutos para mais precisão
    if (connectionState !== 'connected') {
        return; // Bot não está conectado, não faz nada
    }
    
    console.log('🔔 [CRON] Verificando agendamentos para enviar lembretes...');
    try {
        const { data: appointments } = await axios.get('http://localhost:3000/appointments');
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
                
                console.log(`[CRON] Enviando lembrete para ${clientJid}`);
                await sock.sendMessage(clientJid, { text: msg });

                // Atualiza o status no banco para não enviar novamente
                await axios.put(`http://localhost:3000/appointments/${appt.id}`, {
                    ...appt, // Mantém os dados existentes
                    lembrete_enviado: true
                });
            }
        }
    } catch (err) {
        console.error('❌ [CRON] Erro ao executar a tarefa de lembretes:', err.message);
    }
});


// ##################################################################
// ##            API EXPRESS PARA O FRONT-END (QR CODE)            ##
// ##################################################################
app.get('/qr-code', (req, res) => {
    res.json({
        connected: connectionState === 'connected',
        qr: qrCodeImage,
        status: connectionState
    });
});

// ##################################################################
// ##          SERVE OS ARQUIVOS DO FRONT-END (CORRIGIDO)          ##
// ##################################################################

const publicPath = __dirname;
console.log(`[EXPRESS] Servindo arquivos estáticos de: ${publicPath}`);
app.use(express.static(publicPath));
// ##################################################################
// ##                    INICIALIZAÇÃO DO SERVIÇO                  ##
// ##################################################################
app.listen(port, () => {
    console.log(`✅ [EXPRESS] Servidor web rodando em http://localhost:${port}`);
    console.log(`🖥️  Acesse http://localhost:${port}/qrcode.html para conectar o WhatsApp.`);
    
    // Inicia a conexão com o WhatsApp
    connectToWhatsApp().catch(err => {
        console.error("❌ [BAILEYS] Falha crítica na inicialização do bot:", err);
    });
});