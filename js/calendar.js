document.addEventListener('DOMContentLoaded', async function() {
    const calendarEl = document.getElementById('calendar');

    // Buscar agendamentos da API
    async function fetchAppointments() {
        try {
            const res = await fetch('http://localhost:3000/appointments');
            return await res.json();
        } catch (err) {
            console.error('Erro ao buscar agendamentos:', err);
            return [];
        }
    }

    const appointments = await fetchAppointments();

    // Converter em eventos para o FullCalendar
    const events = appointments.map(a => ({
        title: `Cliente: ${a.cliente_nome} (Barbeiro ${a.barber_id})`,
        start: a.data_hora,
        backgroundColor: getColorByBarber(a.barber_id),
        borderColor: '#333'
    }));

    // Cores diferentes por barbeiro
    function getColorByBarber(barberId) {
        const colors = ['#28a745', '#007bff', '#ffc107', '#dc3545', '#6f42c1'];
        return colors[(barberId - 1) % colors.length];
    }

    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'pt-br',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
        },
        events: events
    });

    calendar.render();
});
