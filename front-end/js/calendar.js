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

   const API_KEY = '03ba3d1a-485b-40a0-bdcb-08f2b2a308ed';


    let selectedEvent = null;
    let barbers = [];
    let barberMap = {};
    let calendar;
    let appointments = [];

    async function fetchBarbers() {
        try {
            
            const res = await fetch('http://localhost:3000/barbers', {
                headers: { 'X-API-Key': API_KEY } // Adicionado
            });
            return await res.json();
        } catch (err) {
            console.error('Erro ao buscar barbeiros:', err);
            return [];
        }
    }

    async function fetchAppointments() {
        try {
            const res = await fetch('http://localhost:3000/appointments', {
                headers: { 'X-API-Key': API_KEY } // Adicionado
            });
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
        if (!container) return;

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
                appointmentDateInput.value = info.dateStr;
                document.getElementById('clientName').value = '';
                appointmentBarberSelect.value = '';
                appointmentTimeSelect.innerHTML = `<option value="">Selecione um horário</option>`;
                appointmentTimeSelect.disabled = true;
            }
        });
        calendar.render();
    }

    function getAvailableTimes(barberId, dateStr) {
        const startHour = 8;
        const endHour = 21;
        let times = [];
        const date = new Date(dateStr + 'T00:00:00');
        for (let hour = startHour; hour < endHour; hour++) {
            const dt = new Date(date);
            dt.setHours(hour, 0, 0, 0);
            const busy = appointments.some(appt => {
                if (appt.barber_id !== barberId) return false;
                const apptDate = new Date(appt.data_hora);
                return apptDate.getFullYear() === dt.getFullYear() && apptDate.getMonth() === dt.getMonth() && apptDate.getDate() === dt.getDate() && apptDate.getHours() === dt.getHours();
            });
            if (!busy) {
                const now = new Date();
                if (dt > now) {
                    const hh = hour.toString().padStart(2, '0');
                    times.push(`${hh}:00`);
                }
            }
        }
        return times;
    }

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
        if (availableTimes.length > 0) {
            appointmentTimeSelect.disabled = false;
            availableTimes.forEach(time => {
                const option = document.createElement('option');
                option.value = time;
                option.textContent = time;
                appointmentTimeSelect.appendChild(option);
            });
        } else {
            appointmentTimeSelect.disabled = true;
            const option = document.createElement('option');
            option.textContent = 'Nenhum horário disponível';
            appointmentTimeSelect.appendChild(option);
        }
    }

    barberFilter.addEventListener('change', async () => {
        calendar.setOption('events', await loadEvents());
    });

    appointmentBarberSelect.addEventListener('change', updateTimeOptions);
    appointmentDateInput.addEventListener('change', updateTimeOptions);

    cancelBtn.addEventListener('click', async () => {
        if (!selectedEvent) return;

        const confirmCancel = confirm(`Tem certeza que deseja cancelar o agendamento de ${selectedEvent.extendedProps.cliente} em ${selectedEvent.start.toLocaleString('pt-BR')}?`);
        if (!confirmCancel) return;

        try {
            const res = await fetch(`http://localhost:3000/appointments/${selectedEvent.id}`, {
                method: 'DELETE',
                headers: { 'X-API-Key': API_KEY } // Adicionado
            });

            if (res.ok) {
                alert('Agendamento cancelado com sucesso!');
                modal.style.display = 'none';
                calendar.setOption('events', await loadEvents());
            } else {
                const error = await res.json();
                alert('Erro ao cancelar agendamento: ' + error.error);
            }
        } catch (err) {
            console.error('Erro ao cancelar agendamento:', err);
            alert('Erro ao conectar com o servidor.');
        }
    });
    
    appointmentForm.addEventListener('submit', async function (e) {
        e.preventDefault();
    
        const newAppointment = {
            barber_id: parseInt(appointmentBarberSelect.value),
            cliente_nome: document.getElementById('clientName').value,
            cliente_numero: document.getElementById('clientPhone').value,
            data_hora: `${appointmentDateInput.value} ${appointmentTimeSelect.value}:00`
        };

        if (isNaN(newAppointment.barber_id) || !newAppointment.cliente_nome || !newAppointment.data_hora) {
            alert('Por favor, preencha todos os campos.');
            return;
        }

        try {
            const res = await fetch('http://localhost:3000/appointments', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': API_KEY // Adicionado
                },
                body: JSON.stringify(newAppointment)
            });

            if (res.ok) {
                alert('Agendamento criado com sucesso!');
                newAppointmentModal.style.display = 'none';
                calendar.setOption('events', await loadEvents());
            } else {
                const error = await res.json();
                alert('Erro ao criar agendamento: ' + error.error);
            }
        } catch (err) {
            console.error('Erro ao criar agendamento:', err);
            alert('Erro ao conectar com o servidor.');
        }
    });

    closeModal.onclick = () => modal.style.display = 'none';
    closeNewModal.onclick = () => newAppointmentModal.style.display = 'none';
    window.onclick = function (event) {
        if (event.target == modal) modal.style.display = 'none';
        if (event.target == newAppointmentModal) newAppointmentModal.style.display = 'none';
    };

    await loadBarbers();
    initCalendar();
});