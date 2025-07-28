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

    let selectedEvent = null;
    let barbers = [];
    let barberMap = {};
    let calendar;
    let appointments = [];

    async function fetchBarbers() {
        try {
            const res = await fetch('http://localhost:3000/barbers');
            return await res.json();
        } catch (err) {
            console.error('Erro ao buscar barbeiros:', err);
            return [];
        }
    }

    async function fetchAppointments() {
        try {
            const res = await fetch('http://localhost:3000/appointments');
            return await res.json();
        } catch (err) {
            console.error('Erro ao buscar agendamentos:', err);
            return [];
        }
    }

    function getColorByBarber(barberId) {
        const colors = ['#28a745', '#007bff', '#ffc107', '#dc3545', '#6f42c1'];
        return colors[(barberId - 1) % colors.length];
    }

    async function loadBarbers() {
        barbers = await fetchBarbers();
        console.log('Barbeiros carregados:', barbers);

        barberMap = {};
        barberFilter.innerHTML = `<option value="">Todos</option>`;
        appointmentBarberSelect.innerHTML = `<option value="">Selecione um barbeiro</option>`;

        barbers.forEach(b => {
            barberMap[b.id] = b.nome;
            const optionFilter = document.createElement('option');
            optionFilter.value = b.id;
            optionFilter.textContent = b.nome;
            barberFilter.appendChild(optionFilter);

            const optionForm = document.createElement('option');
            optionForm.value = b.id;
            optionForm.textContent = b.nome;
            appointmentBarberSelect.appendChild(optionForm);
        });
        await loadBarbersList();
    }

    async function loadBarbersList() {
        const container = document.getElementById('barbersListContainer');
        if (!container) return; // evita erro se o container não existir

        container.innerHTML = '';

        barbers.forEach(b => {
            const div = document.createElement('div');
            div.textContent = b.nome;

            const btn = document.createElement('button');
            btn.textContent = 'Remover';
            btn.style.marginLeft = '10px';
            btn.onclick = () => removeBarber(b.id, b.nome);

            div.appendChild(btn);
            container.appendChild(div);
        });
    }

    async function loadEvents() {
        appointments = await fetchAppointments();
        const selectedBarber = barberFilter.value ? Number(barberFilter.value) : null;

        return appointments
            .filter(a => !selectedBarber || a.barber_id === selectedBarber)
            .map(a => ({
                id: a.id,
                title: `Cliente: ${a.cliente_nome} (Barbeiro ${barberMap[a.barber_id] || a.barber_id})`,
                start: a.data_hora,
                backgroundColor: getColorByBarber(a.barber_id),
                borderColor: '#333',
                extendedProps: {
                    cliente: a.cliente_nome,
                    barbeiro: barberMap[a.barber_id] || a.barber_id,
                    data: a.data_hora
                }
            }));
    }

    async function initCalendar() {
        if (calendar) {
            calendar.destroy();
        }

       calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'timeGridWeek',
    locale: 'pt-br',
    headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay'
    },
            slotMinTime: '08:00:00',
            slotMaxTime: '21:00:00',
            events: await loadEvents(),
            eventClick: function (info) {
                selectedEvent = info.event;
                modalTitle.textContent = selectedEvent.title;
                modalDate.textContent = `Data: ${new Date(selectedEvent.start).toLocaleString('pt-BR')}`;
                modal.style.display = 'flex';
            },
            
           dateClick : function (info) {
                newAppointmentModal.style.display = 'flex';
                appointmentDateInput.value = info.dateStr; // só a data yyyy-mm-dd
                document.getElementById('clientName').value = '';
                appointmentBarberSelect.value = '';
                appointmentTimeSelect.innerHTML = `<option value="">Selecione um horário</option>`;
                appointmentTimeSelect.disabled = true;
            }
        });

        calendar.render();
    }

    // Função para buscar horários disponíveis para barbeiro e data
    function getAvailableTimes(barberId, dateStr) {
        const startHour = 8;
        const endHour = 21;
        let times = [];

        const date = new Date(dateStr + 'T00:00:00');

        for (let hour = startHour; hour < endHour; hour++) {
            const dt = new Date(date);
            dt.setHours(hour, 0, 0, 0);

            // Verifica se já existe agendamento nesse horário para esse barbeiro
            const busy = appointments.some(appt => {
                if (appt.barber_id !== barberId) return false;

                const apptDate = new Date(appt.data_hora);
                return apptDate.getFullYear() === dt.getFullYear() &&
                       apptDate.getMonth() === dt.getMonth() &&
                       apptDate.getDate() === dt.getDate() &&
                       apptDate.getHours() === dt.getHours();
            });

            if (!busy) {
                // Verifica se o horário já passou (para não liberar horários passados no dia atual)
                const now = new Date();
                if (dt > now) {
                    const hh = hour.toString().padStart(2, '0');
                    times.push(`${hh}:00`);
                }
            }
        }
        return times;
    }

    // Atualiza opções de horários disponíveis no select
    function updateTimeOptions() {
        const barberId = Number(appointmentBarberSelect.value);
        const dateStr = appointmentDateInput.value;

        appointmentTimeSelect.innerHTML = '';

        if (!barberId || !dateStr) {
            appointmentTimeSelect.disabled = true;
            appointmentTimeSelect.innerHTML = `<option value="">Selecione um horário</option>`;
            return;
        }

        const availableTimes = getAvailableTimes(barberId, dateStr);

        if (availableTimes.length === 0) {
            appointmentTimeSelect.innerHTML = `<option value="">Sem horários disponíveis</option>`;
            appointmentTimeSelect.disabled = true;
        } else {
            availableTimes.forEach(time => {
                const option = document.createElement('option');
                option.value = time;
                option.textContent = time;
                appointmentTimeSelect.appendChild(option);
            });
            appointmentTimeSelect.disabled = false;
        }
    }

    // Atualiza horários quando mudar barbeiro ou data
    appointmentBarberSelect.addEventListener('change', updateTimeOptions);
    appointmentDateInput.addEventListener('change', updateTimeOptions);

    function isTimeSlotAvailable(barberId, dateTimeISO) {
        const agendamentoInicio = new Date(dateTimeISO);
        const agendamentoFim = new Date(agendamentoInicio.getTime() + 60 * 60 * 1000);

        return !appointments.some(appt => {
            if (appt.barber_id != barberId) return false;

            const inicio = new Date(appt.data_hora);
            const fim = new Date(inicio.getTime() + 60 * 60 * 1000);

            return agendamentoInicio < fim && agendamentoFim > inicio;
        });
    }

    cancelBtn.addEventListener('click', async () => {
        if (selectedEvent) {
            const confirmCancel = confirm('Deseja realmente cancelar este agendamento?');
            if (confirmCancel) {
                try {
                    await fetch(`http://localhost:3000/appointments/${selectedEvent.id}`, { method: 'DELETE' });
                    alert('✅ Agendamento cancelado com sucesso!');
                    selectedEvent.remove();
                    modal.style.display = 'none';
                    await initCalendar();
                } catch (err) {
                    console.error('Erro ao cancelar agendamento:', err);
                    alert('❌ Erro ao cancelar agendamento.');
                }
            }
        }
    });

    closeModal.addEventListener('click', () => (modal.style.display = 'none'));
    window.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });

    closeNewModal.addEventListener('click', () => {
        newAppointmentModal.style.display = 'none';
    });
    window.addEventListener('click', (e) => {
        if (e.target === newAppointmentModal) newAppointmentModal.style.display = 'none';
    });

    appointmentForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const clientName = document.getElementById('clientName').value.trim();
        const clientNumber = document.getElementById('clientNumber').value.trim(); // corrigi aqui
        const dateValue = appointmentDateInput.value;
        const timeValue = appointmentTimeSelect.value;
        const selectedBarber = appointmentBarberSelect.value;

        if (!clientName || !clientNumber || !dateValue || !timeValue || !selectedBarber) {
            alert('Por favor, preencha todos os campos, incluindo o número do cliente, barbeiro e horário.');
            return;
        }

        // Monta o datetime ISO para envio
        const dateTimeISO = new Date(`${dateValue}T${timeValue}:00`).toISOString();

        if (!isTimeSlotAvailable(Number(selectedBarber), dateTimeISO)) {
            alert('❌ Horário indisponível para esse barbeiro. Escolha outro horário.');
            return;
        }

        try {
            const res = await fetch('http://localhost:3000/appointments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cliente_nome: clientName,
                    cliente_numero: clientNumber,
                    data_hora: dateTimeISO,
                    barber_id: Number(selectedBarber)
                })
            });

            if (!res.ok) {
                const errMsg = await res.text();
                throw new Error('Erro ao criar agendamento: ' + errMsg);
            }

            alert('✅ Agendamento criado com sucesso!');
            newAppointmentModal.style.display = 'none';
            await initCalendar();
        } catch (err) {
            console.error(err);
            alert('❌ Falha ao criar agendamento.\n' + err.message);
        }
    });

    // Filtro do barbeiro só atualiza eventos sem recriar calendário todo
    barberFilter.addEventListener('change', async () => {
        appointments = await fetchAppointments();
        const selectedBarber = barberFilter.value ? Number(barberFilter.value) : null;

        const filteredEvents = appointments
            .filter(a => !selectedBarber || a.barber_id === selectedBarber)
            .map(a => ({
                id: a.id,
                title: `Cliente: ${a.cliente_nome} (Barbeiro ${barberMap[a.barber_id] || a.barber_id})`,
                start: a.data_hora,
                backgroundColor: getColorByBarber(a.barber_id),
                borderColor: '#333',
                extendedProps: {
                    cliente: a.cliente_nome,
                    barbeiro: barberMap[a.barber_id] || a.barber_id,
                    data: a.data_hora
                }
            }));

        calendar.removeAllEvents();
        calendar.addEventSource(filteredEvents);
    });

    async function removeBarber(id, nome) {
        if (!confirm(`Deseja remover o barbeiro "${nome}"?`)) return;

        try {
            const res = await fetch(`http://localhost:3000/barbers/${id}`, { method: 'DELETE' });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Erro ao remover barbeiro');
            }
            alert('Barbeiro removido com sucesso!');
            // Atualizar lista de barbeiros carregados
            await loadBarbers();
            await initCalendar(); // Recarrega calendário para refletir a mudança
        } catch (err) {
            alert('Erro: ' + err.message);
        }
    }

    await loadBarbers();
    await initCalendar();
});
