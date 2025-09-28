// ======================================================
// calendar.js - v6 (Revisão Geral e Correção Final)
// ======================================================

document.addEventListener('DOMContentLoaded', async function () {
  // ---- DOM ----
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

  // ---- CONFIG ----
  const BASE_URL = 'http://localhost:3000';
  const apiKey = localStorage.getItem('apiKey');
  if (!apiKey) { window.location.href = 'login.html'; return; }

  // ---- Estado ----
  let barbers = [];
  let barberMap = {};
  let horariosMap = {};
  let calendar;

  // ---- Helpers ----
  const pad2 = (n) => String(n).padStart(2, '0');
  const toISODate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const weekdayKey = (iso) => ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'][new Date(`${iso}T00:00:00`).getDay()];
  const addMinutes = (date, m) => new Date(date.getTime() + m * 60000);
  const timeStrToMin = (str) => { const [h, m] = String(str || '00:00:00').split(':').map(Number); return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m); };
  const minToTimeStr = (min) => { const h = Math.floor(min / 60), m = min % 60; return `${pad2(h)}:${pad2(m)}:00`; };
  const timeToObj = (hhmm) => { const [h, m] = String(hhmm || '09:00').split(':').map(Number); return { h: isNaN(h) ? 9 : h, m: isNaN(m) ? 0 : m }; };
  const colorFromId = (id) => { const num = Number(id) || 0; const hue = (num * 67) % 360; return `hsl(${hue} 85% 45%)`; };

  // ---- API ----
  async function fetchBarbers() { try { const r = await fetch(`${BASE_URL}/barbers`, { headers: { 'X-API-Key': apiKey } }); return r.ok ? r.json() : []; } catch { return []; } }
  async function fetchAppointments() { try { const r = await fetch(`${BASE_URL}/appointments`, { headers: { 'X-API-Key': apiKey } }); return r.ok ? r.json() : []; } catch { return []; } }
  async function fetchHorarios() { try { const r = await fetch(`${BASE_URL}/horarios`, { headers: { 'X-API-Key': apiKey } }); const rows = r.ok ? await r.json() : []; const map = {}; rows.forEach(h => map[(h.dia_semana || '').toLowerCase()] = { abertura: h.horario_abertura, fechamento: h.horario_fechamento, intervalo: Number(h.intervalo_minutos) || 30 }); return map; } catch { return {}; } }

  // ===================================================================
  // FUNÇÃO ATUALIZADA: Agora ela cria um título mais completo para o
  // FullCalendar renderizar nativamente, sem precisar da 'eventContent'.
  // ===================================================================
  function createEvents(list) {
    if (!Array.isArray(list)) {
      console.error('Erro Crítico: A resposta da API de agendamentos não é uma lista (array). Valor recebido:', list);
      return [];
    }
  
    const groupedByTime = list.reduce((acc, appt) => {
      if (!appt || !appt.data_hora) return acc;
      const key = appt.data_hora;
      if (!acc[key]) acc[key] = [];
      acc[key].push(appt);
      return acc;
    }, {});
  
    const finalEvents = Object.values(groupedByTime).flatMap((group) => {
      const firstAppt = group[0];
      const start = new Date(firstAppt.data_hora);
  
      const isoDate = firstAppt.data_hora.substring(0, 10);
      const daySchedule = getDaySchedule(isoDate);
      const appointmentDuration = daySchedule.interval;
      const end = addMinutes(start, appointmentDuration);
  
      if (group.length === 1) {
        const barberName = barberMap[firstAppt.barber_id]?.nome || 'Barbeiro';
        return [{
          id: firstAppt.id,
          // O título agora inclui o nome do barbeiro. O FullCalendar mostrará a hora por padrão.
          title: `${firstAppt.cliente_nome}\n— ${barberName}`,
          start: firstAppt.data_hora,
          end: end.toISOString(),
          allDay: false,
          extendedProps: {
            isGroup: false,
            barberId: firstAppt.barber_id,
            barberName: barberName,
            clientNumber: firstAppt.cliente_numero,
          },
        }];
      } else {
        return [{
          id: `group-${firstAppt.data_hora}`,
          title: `${group.length} Agendamentos`,
          start: firstAppt.data_hora,
          end: end.toISOString(),
          allDay: false,
          extendedProps: {
            isGroup: true,
            originalEvents: group.map((appt) => ({
              ...appt,
              barberName: barberMap[appt.barber_id]?.nome || 'Barbeiro',
            })),
          },
        }];
      }
    });
    return finalEvents;
  }
  
  async function eventsFetcher(fetchInfo, successCallback, failureCallback) {
    try {
      const appointments = await fetchAppointments();
      const events = createEvents(appointments);
      successCallback(events);
    } catch (error) {
      console.error("Erro ao buscar eventos:", error);
      failureCallback(error);
    }
  }

  async function applyGridOptions(viewInfo) {
    const viewType = viewInfo?.view?.type || 'timeGridWeek';
    const start = new Date(viewInfo.startStr);
    const end = new Date(viewInfo.endStr);
    const days = [];
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      days.push(new Date(d));
    }

    let earliestOpen = Infinity;
    let latestClose = -Infinity;

    days.forEach((d) => {
      const iso = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      const { openStr, closeStr } = getDaySchedule(iso);
      earliestOpen = Math.min(earliestOpen, timeStrToMin(openStr));
      latestClose = Math.max(latestClose, timeStrToMin(closeStr));
    });

    if (!isFinite(earliestOpen)) earliestOpen = timeStrToMin('08:00:00');
    if (!isFinite(latestClose)) latestClose = timeStrToMin('20:00:00');

    calendar.setOption('slotDuration', '00:30:00');
    calendar.setOption('slotLabelInterval', '01:00:00');
    calendar.setOption('slotMinTime', minToTimeStr(earliestOpen));
    calendar.setOption('slotMaxTime', minToTimeStr(latestClose));
    calendar.setOption('height', 'auto');
    calendar.setOption('contentHeight', 'auto');

    const iso = (viewInfo?.startStr || new Date().toISOString()).slice(0, 10);
    const { openStr } = getDaySchedule(iso);
    calendar.setOption(
      'scrollTime',
      viewType === 'timeGridWeek' ? minToTimeStr(earliestOpen) : openStr
    );
  }

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

  function getDaySchedule(dateISO) {
    const key = weekdayKey(dateISO);
    const h = horariosMap[key] || {};
    const open = timeToObj(h.abertura || '09:00');
    const close = timeToObj(h.fechamento || '18:00');
    const interval = h.intervalo || 30;
    return { openStr: `${pad2(open.h)}:${pad2(open.m)}:00`, closeStr: `${pad2(close.h)}:${pad2(close.m)}:00`, interval };
  }

  function buildBusinessHoursFromMap() {
    const week = ['domingo','segunda','terca','quarta','quinta','sexta','sabado'];
    const blocks = [];
    week.forEach((k, i) => {
      const h = horariosMap[k];
      if (!h) return;
      blocks.push({ daysOfWeek: [i], startTime: (h.abertura || '09:00') + ':00', endTime: (h.fechamento || '18:00') + ':00' });
    });
    return blocks;
  }
  
  // A FUNÇÃO 'eventContent' FOI REMOVIDA.

  async function setupCalendar() {
    barbers = await fetchBarbers();
    barberMap = barbers.reduce((a, b) => (a[b.id] = b, a), {});
    horariosMap = await fetchHorarios();

    barberFilter.innerHTML = '<option value="">Todos</option>';
    barbers.forEach(b => { const o = document.createElement('option'); o.value = b.id; o.textContent = b.nome; barberFilter.appendChild(o); });
    appointmentBarberSelect.innerHTML = '<option value="">Selecione um barbeiro</option>';
    barbers.forEach(b => { const o = document.createElement('option'); o.value = b.id; o.textContent = b.nome; appointmentBarberSelect.appendChild(o); });

    calendar = new FullCalendar.Calendar(calendarEl, {
      initialView: 'timeGridWeek',
      locale: 'pt-br',
      headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek' },
      buttonText: { today: 'Hoje', month: 'Mês', week: 'Semana', day: 'Dia', list: 'Lista' },
      dayMaxEventRows: 3, moreLinkClick: 'timeGridDay', moreLinkText: (n) => `+${n} mais`,
      nowIndicator: true, expandRows: true, stickyHeaderDates: true,
      eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
      businessHours: buildBusinessHoursFromMap(),
      datesSet: async (arg) => { await applyGridOptions(arg); },
      
      // A linha 'eventContent' foi removida daqui
      
      eventDidMount: (info) => {
        const props = info.event.extendedProps;
        let color;
        if (props.isGroup) { color = colorFromId(props.originalEvents[0].barber_id); } 
        else { color = colorFromId(props.barberId); }
        info.el.style.background = color;
        info.el.style.borderColor = 'transparent';
        info.el.title = info.event.title; // O title já tem toda a info que precisamos
      },
      dateClick: (info) => {
        const clickedDate = new Date(info.date);
        const dateStr = toISODate(clickedDate);
        const timeStr = `${pad2(clickedDate.getHours())}:${pad2(clickedDate.getMinutes())}`;
        appointmentDateInput.value = dateStr;
        loadAvailableTimes(appointmentBarberSelect.value, dateStr).then(() => { appointmentTimeSelect.value = timeStr; });
        newAppointmentModal.style.display = 'flex';
      },
      eventClick: (info) => {
        const props = info.event.extendedProps;
        if (props.isGroup) {
          modalTitle.textContent = info.event.title;
          const detailsList = props.originalEvents.map(ev => `<li><span><strong>${ev.cliente_nome}</strong> com ${ev.barberName}</span><button class="cancel-single-btn" data-id="${ev.id}" title="Cancelar este agendamento">❌</button></li>`).join('');
          modalDate.innerHTML = `<ul class="appointment-list">${detailsList}</ul>`;
          cancelBtn.style.display = 'none';
        } else {
          modalTitle.textContent = `${info.event.title.split('\n')[0]} - ${props.barberName}`;
          modalDate.innerHTML = `Data: ${info.event.start.toLocaleString('pt-br', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
          cancelBtn.style.display = 'block';
          cancelBtn.setAttribute('data-id', info.event.id);
        }
        modal.style.display = 'flex';
      },
      events: eventsFetcher,
      eventClassNames: (info) => {
        const props = info.event.extendedProps;
        if (props.isGroup) { return ['fc-event-group']; }
        return props.barberId ? [`barber-${props.barberId}`] : [];
      }
    });

    calendar.render();

    barberFilter.addEventListener('change', () => {
      const id = barberFilter.value;
      calendar.getEvents().forEach(ev => {
        let visible = !id;
        if (id) {
          const props = ev.extendedProps;
          if (props.isGroup) { visible = props.originalEvents.some(orig => String(orig.barber_id) === id); } 
          else { visible = String(props.barberId) === id; }
        }
        ev.setProp('display', visible ? 'auto' : 'none');
      });
    });
  }

  cancelBtn.onclick = async () => {
    const appointmentId = cancelBtn.getAttribute('data-id');
    if (!appointmentId) return;
    if (window.confirm('Tem certeza que deseja cancelar este agendamento?')) {
        try {
            const r = await fetch(`${BASE_URL}/appointments/${appointmentId}`, { method: 'DELETE', headers: { 'X-API-Key': apiKey } });
            if (r.ok) { alert('✅ Agendamento cancelado com sucesso!'); modal.style.display = 'none'; calendar.refetchEvents(); } 
            else { const e = await r.json(); alert('❌ Erro ao cancelar: ' + (e.error || 'Falha na API')); }
        } catch { alert('❌ Erro de conexão.'); }
    }
  };

  modal.addEventListener('click', async function(e) {
    if (e.target && e.target.matches('.cancel-single-btn')) {
        const appointmentId = e.target.getAttribute('data-id');
        const clientName = e.target.closest('li').querySelector('strong').textContent;
        if (window.confirm(`Tem certeza que deseja cancelar o agendamento de ${clientName}?`)) {
            try {
                const r = await fetch(`${BASE_URL}/appointments/${appointmentId}`, { method: 'DELETE', headers: { 'X-API-Key': apiKey } });
                if (r.ok) { alert('✅ Agendamento cancelado com sucesso!'); modal.style.display = 'none'; calendar.refetchEvents(); } 
                else { const e = await r.json(); alert('❌ Erro ao cancelar: ' + (e.error || 'Falha na API')); }
            } catch { alert('❌ Erro ao conectar com o servidor.'); }
        }
    }
  });

  appointmentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      barber_id: Number(appointmentBarberSelect.value),
      cliente_nome: clientNameInput.value,
      cliente_numero: clientNumberInput.value,
      data_hora: `${appointmentDateInput.value}T${appointmentTimeSelect.value}:00`
    };
    if (!payload.barber_id || !payload.cliente_nome || !appointmentDateInput.value || !appointmentTimeSelect.value) { alert('Preencha todos os campos.'); return; }
    try {
      const r = await fetch(`${BASE_URL}/appointments`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey }, body: JSON.stringify(payload) });
      if (r.ok) { alert('✅ Agendamento criado com sucesso!'); newAppointmentModal.style.display = 'none'; appointmentForm.reset(); calendar.refetchEvents(); } 
      else { const e = await r.json(); alert('❌ Erro ao criar agendamento: ' + (e.error || 'Falha na API')); }
    } catch { alert('❌ Erro ao conectar com o servidor.'); }
  });

  appointmentBarberSelect.addEventListener('change', () => { const id = appointmentBarberSelect.value; const d = appointmentDateInput.value; if (id && d) loadAvailableTimes(id, d); });
  appointmentDateInput.addEventListener('change', () => { const id = appointmentBarberSelect.value; const d = appointmentDateInput.value; if (id && d) loadAvailableTimes(id, d); });

  closeModal.onclick = () => (modal.style.display = 'none');
  closeNewModal.onclick = () => (newAppointmentModal.style.display = 'none');
  window.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
    if (e.target === newAppointmentModal) newAppointmentModal.style.display = 'none';
  });

  await setupCalendar();
});