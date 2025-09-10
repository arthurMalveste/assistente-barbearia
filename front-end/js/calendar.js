// ======================================================
// calendar.js - VERSÃO ATUALIZADA
// ======================================================

document.addEventListener('DOMContentLoaded', async function () {
    const calendarEl = document.getElementById('calendar');
    const barberFilter = document.getElementById('barberFilter');
    const modal = document.getElementById('modal');
    const closeModal = document.getElementById('closeModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalDate = document.getElementById('modalDate');
    const cancelBtn = document.getElementById('cancelBtn');
    const newAppointmentModal = document.getElementById('newAppointmentModal');
    const closeNewModal = document.getElementById('closeNewModal');
    const appointmentForm = document.getElementById('appointmentForm');
    const appointmentBarberSelect = document.getElementById('appointmentBarber');
    const appointmentDateInput = document.getElementById('appointmentDate');
    const appointmentTimeSelect = document.getElementById('appointmentTime');
    const clientNameInput = document.getElementById('clientName');
    const clientNumberInput = document.getElementById('clientNumber');


    // --- Lógica para a Chave API ---
    const apiKey = localStorage.getItem('apiKey');
    const BASE_URL = 'http://localhost:3000';

    if (!apiKey) {
        console.error('Chave API não encontrada.');
        window.location.href = 'login.html';
        return;
    }

    let selectedEvent = null;
    let barbers = [];
    let barberMap = {};
    let calendar;
    let appointments = [];

    

    async function fetchBarbers() {
        try {
            const res = await fetch(`${BASE_URL}/barbers`, {
                headers: { 'X-API-Key': apiKey }
            });
            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error);
            }
            return await res.json();
        } catch (err) {
            console.error('Erro ao buscar barbeiros:', err);
            showCustomAlert('Erro ao buscar barbeiros.');
            return [];
        }
    }

    async function fetchAppointments() {
        try {
            const res = await fetch(`${BASE_URL}/appointments`, {
                headers: { 'X-API-Key': apiKey }
            });
            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error);
            }
            return await res.json();
        } catch (err) {
            console.error('Erro ao buscar agendamentos:', err);
            showCustomAlert('Erro ao buscar agendamentos.');
            return [];
        }
    }

    function createEvents(appointments) {
        return appointments.map(appt => ({
            id: appt.id,
            title: `💈 ${appt.cliente_nome} - ${barberMap[appt.barber_id]?.nome || 'Barbeiro Desconhecido'}`,
            start: appt.data_hora,
            allDay: false,
            extendedProps: {
                barberId: appt.barber_id,
                barberName: barberMap[appt.barber_id]?.nome || 'Barbeiro Desconhecido',
                clientNumber: appt.cliente_numero
            }
        }));
    }
    
    // --- FUNÇÃO PARA CARREGAR OS HORÁRIOS DISPONÍVEIS (ATUALIZADO) ---
    // --- FUNÇÃO ATUALIZADA: busca na API os horários disponíveis ---
async function loadAvailableTimes(barberId, date) {
  const timeSelect = document.getElementById('appointmentTime');
  timeSelect.innerHTML = '';
  try {
    const url = new URL(`${BASE_URL}/horarios/disponiveis`);
    url.searchParams.set('date', date);
    if (barberId) url.searchParams.set('barber_id', barberId);

    const res = await fetch(url.toString(), { headers: { 'X-API-Key': apiKey } });
    if (!res.ok) throw new Error('Falha ao carregar horários.');
    const data = await res.json();
    const slots = data.slots || [];

    if (slots.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Sem horários disponíveis';
      timeSelect.appendChild(opt);
      return;
    }

    slots.forEach(hhmm => {
      const opt = document.createElement('option');
      opt.value = hhmm;
      opt.textContent = hhmm;
      timeSelect.appendChild(opt);
    });
  } catch (e) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Erro ao carregar horários';
    timeSelect.appendChild(opt);
    console.error(e);
  }
}

    // --- FIM DA FUNÇÃO ATUALIZADA ---
    
    async function loadEvents() {
        appointments = await fetchAppointments();
        return createEvents(appointments);
    }

    async function setupCalendar() {
        barbers = await fetchBarbers();
        barberMap = barbers.reduce((acc, barber) => {
            acc[barber.id] = barber;
            return acc;
        }, {});

        barberFilter.innerHTML = '<option value="">Todos</option>';
        barbers.forEach(barber => {
            const option = document.createElement('option');
            option.value = barber.id;
            option.textContent = barber.nome;
            barberFilter.appendChild(option);
        });

        appointmentBarberSelect.innerHTML = '<option value="">Selecione um barbeiro</option>';
        barbers.forEach(barber => {
            const option = document.createElement('option');
            option.value = barber.id;
            option.textContent = barber.nome;
            appointmentBarberSelect.appendChild(option);
        });

        calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth',
            locale: 'pt-br',
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay'
            },
            buttonText: {
    today: 'Hoje',
    month: 'Mês',
    week: 'Semana',
    day: 'Dia'
},
            dateClick: function(info) {
                appointmentDateInput.value = info.dateStr;
                appointmentTimeSelect.value = '';
                
                // --- CHAMADA PARA CARREGAR OS HORÁRIOS ---
                const selectedBarberId = appointmentBarberSelect.value;
                if (selectedBarberId && info.dateStr) {
                    loadAvailableTimes(selectedBarberId, info.dateStr);
                }
                // --- FIM DA CHAMADA ---
                
                newAppointmentModal.style.display = 'flex';
            },
            eventClick: function(info) {
                selectedEvent = info.event;
                modalTitle.textContent = selectedEvent.title;
                modalDate.textContent = `Data: ${selectedEvent.start.toLocaleString('pt-br', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                })}`;
                modal.style.display = 'flex';
            },
            events: await loadEvents(),
            eventClassNames: function(info) {
                const barberId = info.event.extendedProps.barberId;
                const barber = barberMap[barberId];
                return barber ? `barber-${barber.id}` : '';
            }
        });
        calendar.render();

        barberFilter.addEventListener('change', () => {
            const selectedBarberId = barberFilter.value;
            calendar.getEvents().forEach(event => {
                const barberId = event.extendedProps.barberId;
                const isVisible = !selectedBarberId || String(barberId) === selectedBarberId;
                event.setProp('display', isVisible ? 'auto' : 'none');
            });
        });
    }

    cancelBtn.onclick = async () => {
        if (!selectedEvent) return;
        if (!window.confirm('Tem certeza que deseja cancelar este agendamento?')) {
            return;
        }

        try {
            const res = await fetch(`${BASE_URL}/appointments/${selectedEvent.id}`, {
                method: 'DELETE',
                headers: { 'X-API-Key': apiKey }
            });

            if (res.ok) {
                selectedEvent.remove();
                modal.style.display = 'none';
                alert('✅ Agendamento cancelado com sucesso!');

            } else {
                const error = await res.json();
                alert('❌ Erro ao cancelar agendamento: ' + error.error);

            }
        } catch (err) {
            console.error('Erro ao cancelar agendamento:', err);
            showCustomAlert('❌ Erro ao conectar com o servidor.');
        }
    };

    appointmentForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const newAppointment = {
            barber_id: appointmentBarberSelect.value,
            cliente_nome: clientNameInput.value,
            cliente_numero: clientNumberInput.value,
            data_hora: `${appointmentDateInput.value}T${appointmentTimeSelect.value}:00`
        };

        if (isNaN(newAppointment.barber_id) || !newAppointment.cliente_nome || !newAppointment.data_hora) {
            showCustomAlert('Por favor, preencha todos os campos.');
            return;
        }

        try {
            const res = await fetch(`${BASE_URL}/appointments`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': apiKey
                },
                body: JSON.stringify(newAppointment)
            });

            if (res.ok) {
                alert('✅ Agendamento criado com sucesso!');

                newAppointmentModal.style.display = 'none';
                calendar.setOption('events', await loadEvents());
            } else {
                const error = await res.json();
                showCustomAlert('❌ Erro ao criar agendamento: ' + error.error);
            }
        } catch (err) {
            console.error('Erro ao criar agendamento:', err);
            showCustomAlert('❌ Erro ao conectar com o servidor.');
        }
    });
    
    // --- ADICIONA EVENT LISTENERS PARA ATUALIZAR OS HORÁRIOS ---
    appointmentBarberSelect.addEventListener('change', () => {
        const selectedBarberId = appointmentBarberSelect.value;
        const selectedDate = appointmentDateInput.value;
        if (selectedBarberId && selectedDate) {
            loadAvailableTimes(selectedBarberId, selectedDate);
        }
    });

    appointmentDateInput.addEventListener('change', () => {
        const selectedBarberId = appointmentBarberSelect.value;
        const selectedDate = appointmentDateInput.value;
        if (selectedBarberId && selectedDate) {
            loadAvailableTimes(selectedBarberId, selectedDate);
        }
    });
    // --- FIM DOS EVENT LISTENERS ADICIONADOS ---


    closeModal.onclick = () => modal.style.display = 'none';
    closeNewModal.onclick = () => newAppointmentModal.style.display = 'none';
    window.onclick = function (event) {
        if (event.target == modal) modal.style.display = 'none';
        if (event.target == newAppointmentModal) newAppointmentModal.style.display = 'none';
    };

    await setupCalendar();

});