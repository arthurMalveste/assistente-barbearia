document.addEventListener('DOMContentLoaded', async function () {
    const calendarEl = document.getElementById('calendar');
    const barberFilter = document.getElementById('barberFilter');

    const modal = document.getElementById('modal');
    const closeModal = document.getElementById('closeModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalDate = document.getElementById('modalDate');
    const cancelBtn = document.getElementById('cancelBtn');

    let selectedEvent = null;
    let barbers = [];
    let barberMap = {};
    let calendar;

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
        barberMap = {};
        barberFilter.innerHTML = `<option value="">Todos</option>`;
        barbers.forEach(b => {
            barberMap[b.id] = b.nome;
            const option = document.createElement('option');
            option.value = b.id;
            option.textContent = b.nome;
            barberFilter.appendChild(option);
        });
    }

    async function loadEvents() {
        const appointments = await fetchAppointments();
        const selectedBarber = barberFilter.value;

        return appointments
            .filter(a => !selectedBarber || a.barber_id == selectedBarber)
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
            events: await loadEvents(),
            eventClick: function (info) {
                selectedEvent = info.event;
                modalTitle.textContent = selectedEvent.title;
                modalDate.textContent = `Data: ${new Date(selectedEvent.start).toLocaleString('pt-BR')}`;
                modal.style.display = 'flex';
            }
        });

        calendar.render();
    }

    // Cancelar agendamento
    cancelBtn.addEventListener('click', async () => {
        if (selectedEvent) {
            const confirmCancel = confirm('Deseja realmente cancelar este agendamento?');
            if (confirmCancel) {
                try {
                    await fetch(`http://localhost:3000/appointments/${selectedEvent.id}`, { method: 'DELETE' });
                    alert('✅ Agendamento cancelado com sucesso!');
                    selectedEvent.remove();
                    modal.style.display = 'none';
                } catch (err) {
                    console.error('Erro ao cancelar agendamento:', err);
                    alert('❌ Erro ao cancelar agendamento.');
                }
            }
        }
    });

    // Fechar modal
    closeModal.addEventListener('click', () => modal.style.display = 'none');
    window.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });

    // Filtrar ao mudar barbeiro
    barberFilter.addEventListener('change', async () => {
        await initCalendar();
    });

    // Inicialização
    await loadBarbers();
    await initCalendar();
});
