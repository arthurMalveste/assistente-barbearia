// ======================================================
// calendar.js - UI refinada + legibilidade + correções
// ======================================================

document.addEventListener('DOMContentLoaded', async function () {
  // ---- DOM ----
  const calendarEl = document.getElementById('calendar');
  const barberFilter = document.getElementById('barberFilter');

  // Modal detalhes
  const modal = document.getElementById('modal');
  const closeModal = document.getElementById('closeModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalDate = document.getElementById('modalDate');
  const cancelBtn = document.getElementById('cancelBtn');

  // Modal novo agendamento
  const newAppointmentModal = document.getElementById('newAppointmentModal');
  const closeNewModal = document.getElementById('closeNewModal');
  const appointmentForm = document.getElementById('appointmentForm');
  const appointmentBarberSelect = document.getElementById('appointmentBarber');
  const appointmentDateInput = document.getElementById('appointmentDate');
  const appointmentTimeSelect = document.getElementById('appointmentTime');
  const clientNameInput = document.getElementById('clientName');
  const clientNumberInput = document.getElementById('clientNumber');

  // ---- CONFIG ----
  const BASE_URL = 'http://localhost:3000';
  const apiKey = localStorage.getItem('apiKey');
  if (!apiKey) { window.location.href = 'login.html'; return; }

  // ---- Estado ----
  let selectedEvent = null;
  let barbers = [];
  let barberMap = {};
  let appointments = [];
  let horariosMap = {}; // {segunda|terca|...: {abertura, fechamento, intervalo}}
  let calendar;

  // ---- Utils ----
  const pad2 = (n) => String(n).padStart(2, '0');
  const toISODate = (d) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  const weekdayKey = (iso) => ['domingo','segunda','terca','quarta','quinta','sexta','sabado'][new Date(`${iso}T00:00:00`).getDay()];
  const addMinutes = (date, m) => new Date(date.getTime() + m * 60000);
  const minutesToDuration = (min) => {
    const m = Math.max(5, Number(min) || 30);
    return `${pad2(Math.floor(m/60))}:${pad2(m%60)}:00`;
  };

  // ---- API ----
  async function fetchBarbers() {
    try {
      const r = await fetch(`${BASE_URL}/barbers`, { headers: { 'X-API-Key': apiKey } });
      return r.ok ? r.json() : [];
    } catch { return []; }
  }

  async function fetchAppointments() {
    try {
      const r = await fetch(`${BASE_URL}/appointments`, { headers: { 'X-API-Key': apiKey } });
      return r.ok ? r.json() : [];
    } catch { return []; }
  }

  async function fetchHorarios() {
    try {
      const r = await fetch(`${BASE_URL}/horarios`, { headers: { 'X-API-Key': apiKey } });
      const rows = r.ok ? await r.json() : [];
      const map = {};
      rows.forEach(h => map[(h.dia_semana||'').toLowerCase()] = {
        abertura: h.horario_abertura,
        fechamento: h.horario_fechamento,
        intervalo: Number(h.intervalo_minutos) || 30
      });
      return map;
    } catch { return {}; }
  }

  // ---- Eventos com duração = intervalo do dia (legível nos grids) ----
  function createEvents(list) {
    return list.map(appt => {
      const start = new Date(appt.data_hora);
      const iso = toISODate(start);
      const key = weekdayKey(iso);
      const interval = horariosMap[key]?.intervalo || 30;
      const end = addMinutes(start, interval);
      return {
        id: appt.id,
        title: `${appt.cliente_nome} - ${barberMap[appt.barber_id]?.nome || 'Barbeiro'}`,
        start: appt.data_hora,
        end: end.toISOString(),
        allDay: false,
        extendedProps: {
          barberId: appt.barber_id,
          barberName: barberMap[appt.barber_id]?.nome || 'Barbeiro',
          clientNumber: appt.cliente_numero
        }
      };
    });
  }

  async function loadEvents() {
    appointments = await fetchAppointments();
    return createEvents(appointments);
  }

  // ---- Slots disponíveis (modal) ----
  async function loadAvailableTimes(barberId, dateISO) {
    appointmentTimeSelect.innerHTML = '';
    try {
      const url = new URL(`${BASE_URL}/horarios/disponiveis`);
      url.searchParams.set('date', dateISO);
      if (barberId) url.searchParams.set('barber_id', barberId);

      const res = await fetch(url.toString(), { headers: { 'X-API-Key': apiKey } });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const slots = data.slots || [];

      if (!slots.length) {
        appointmentTimeSelect.innerHTML = '<option value="">Sem horários disponíveis</option>';
        return;
      }
      appointmentTimeSelect.innerHTML = slots.map(s => `<option value="${s}">${s}</option>`).join('');
    } catch {
      appointmentTimeSelect.innerHTML = '<option value="">Erro ao carregar horários</option>';
    }
  }

  // ---- Grade acompanha o intervalo, rótulo a cada 1h (limpo) ----
  async function applyGridInterval(viewInfo) {
    const focusISO = (viewInfo?.startStr || new Date().toISOString()).slice(0,10);
    const key = weekdayKey(focusISO);
    const interval = horariosMap[key]?.intervalo || 30;
    calendar.setOption('slotDuration', minutesToDuration(interval));
    calendar.setOption('slotLabelInterval', '01:00:00');
  }

  // ---- Conteúdo compacto e legível nos cards ----
  function humanTitle(arg) {
    const e = arg.event;
    const time = e.start ? `${pad2(e.start.getHours())}:${pad2(e.start.getMinutes())}` : '';
    const cliente = (e.title || '').split(' - ')[0];
    const barbeiro = e.extendedProps?.barberName || '';
    if (arg.view.type === 'dayGridMonth') {
      return `<b>${time}</b> ${cliente}`;
    }
    return `<b>${time}</b> · ${cliente} <span class="muted">— ${barbeiro}</span>`;
  }

  function eventContent(arg) {
    const html = `<span class="fc-event-main-text">${humanTitle(arg)}</span>`;
    // title (tooltip nativo) com o texto completo
    return { html, classNames: ['fc-event-compact'], title: arg.event.title };
  }

  // ---- Inicialização ----
  async function setupCalendar() {
    barbers = await fetchBarbers();
    barberMap = barbers.reduce((a,b)=> (a[b.id]=b, a), {});
    horariosMap = await fetchHorarios();

    // filtro topo + selects do modal
    barberFilter.innerHTML = '<option value="">Todos</option>';
    barbers.forEach(b => {
      const o = document.createElement('option'); o.value = b.id; o.textContent = b.nome; barberFilter.appendChild(o);
    });
    appointmentBarberSelect.innerHTML = '<option value="">Selecione um barbeiro</option>';
    barbers.forEach(b => {
      const o = document.createElement('option'); o.value = b.id; o.textContent = b.nome; appointmentBarberSelect.appendChild(o);
    });

    calendar = new FullCalendar.Calendar(calendarEl, {
      initialView: 'dayGridMonth',
      locale: 'pt-br',
      headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' },
      buttonText: { today: 'Hoje', month: 'Mês', week: 'Semana', day: 'Dia' },

      // ✅ Mês limpo
      dayMaxEventRows: 3,
      moreLinkClick: 'timeGridDay',
      moreLinkText: (n) => `+${n} mais`,

      // Legibilidade geral
      nowIndicator: true,
      slotLabelInterval: '01:00:00',
      eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },

      // Aplica intervalo do dia na grade
      datesSet: async (arg) => { await applyGridInterval(arg); },

      // Texto compacto
      eventContent,

      // Agendar manualmente
      dateClick: (info) => {
        appointmentDateInput.value = info.dateStr;
        appointmentTimeSelect.innerHTML = '<option value="">Selecione um horário</option>';
        const selectedBarberId = appointmentBarberSelect.value;
        if (selectedBarberId && info.dateStr) {
          loadAvailableTimes(selectedBarberId, info.dateStr);
        }
        newAppointmentModal.style.display = 'flex';
      },

      // Modal detalhes
      eventClick: (info) => {
        selectedEvent = info.event;
        modalTitle.textContent = info.event.title;
        modalDate.textContent = `Data: ${info.event.start.toLocaleString('pt-br', {
          day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'
        })}`;
        modal.style.display = 'flex';
      },

      // Eventos
      events: await loadEvents(),

      // Classe por barbeiro (se quiser colorir por CSS)
      eventClassNames: (info) => {
        const id = info.event.extendedProps.barberId;
        return id ? [`barber-${id}`] : [];
      }
    });

    calendar.render();

    // Filtro por barbeiro
    barberFilter.addEventListener('change', () => {
      const id = barberFilter.value;
      calendar.getEvents().forEach(ev => {
        const visible = !id || String(ev.extendedProps.barberId) === id;
        ev.setProp('display', visible ? 'auto' : 'none');
      });
    });
  }

  // ---- Cancelar / Criar ----
  cancelBtn.onclick = async () => {
    if (!selectedEvent) return;
    if (!window.confirm('Tem certeza que deseja cancelar este agendamento?')) return;
    try {
      const r = await fetch(`${BASE_URL}/appointments/${selectedEvent.id}`, {
        method: 'DELETE', headers: { 'X-API-Key': apiKey }
      });
      if (r.ok) {
        selectedEvent.remove();
        modal.style.display = 'none';
        alert('✅ Agendamento cancelado com sucesso!');
      } else {
        const e = await r.json();
        alert('❌ Erro ao cancelar: ' + (e.error || 'Falha na API'));
      }
    } catch { alert('❌ Erro ao conectar com o servidor.'); }
  };

  appointmentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      barber_id: Number(appointmentBarberSelect.value),
      cliente_nome: clientNameInput.value,
      cliente_numero: clientNumberInput.value,
      data_hora: `${appointmentDateInput.value}T${appointmentTimeSelect.value}:00`
    };
    if (!payload.barber_id || !payload.cliente_nome || !appointmentDateInput.value || !appointmentTimeSelect.value) {
      alert('Preencha todos os campos.'); return;
    }
    try {
      const r = await fetch(`${BASE_URL}/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify(payload)
      });
      if (r.ok) {
        alert('✅ Agendamento criado com sucesso!');
        newAppointmentModal.style.display = 'none';
        horariosMap = await fetchHorarios();
        calendar.setOption('events', await loadEvents());
      } else {
        const e = await r.json();
        alert('❌ Erro ao criar agendamento: ' + (e.error || 'Falha na API'));
      }
    } catch { alert('❌ Erro ao conectar com o servidor.'); }
  });

  // Atualiza horários no modal
  appointmentBarberSelect.addEventListener('change', () => {
    const id = appointmentBarberSelect.value;
    const d = appointmentDateInput.value;
    if (id && d) loadAvailableTimes(id, d);
  });
  appointmentDateInput.addEventListener('change', () => {
    const id = appointmentBarberSelect.value;
    const d = appointmentDateInput.value;
    if (id && d) loadAvailableTimes(id, d);
  });

  // Fechar modais
  closeModal.onclick = () => (modal.style.display = 'none');
  closeNewModal.onclick = () => (newAppointmentModal.style.display = 'none');
  window.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
    if (e.target === newAppointmentModal) newAppointmentModal.style.display = 'none';
  });

  // Go!
  await setupCalendar();
});
