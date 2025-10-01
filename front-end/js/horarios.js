// ====== CONFIG ======
const BASE_URL = 'http://localhost:3000';
const apiKey = localStorage.getItem('apiKey');
if (!apiKey) { window.location.href = 'login.html'; }

// ====== DOM ======
const form = document.getElementById('horariosForm');
const saveBtn = document.getElementById('saveBtn');
const msg = document.getElementById('msg');

const DIAS = [
  { key:'segunda', label:'Segunda' },
  { key:'terca',   label:'Terça'   },
  { key:'quarta',  label:'Quarta'  },
  { key:'quinta',  label:'Quinta'  },
  { key:'sexta',   label:'Sexta'   },
  { key:'sabado',  label:'Sábado'  },
  { key:'domingo', label:'Domingo' },
];

function line(dia, v={}) {
  const row = document.createElement('div');
  row.className = 'grid row';
  row.innerHTML = `
    <div>${dia.label}</div>
    <div><input type="time" name="${dia.key}_abertura" value="${v.horario_abertura||''}"></div>
    <div><input type="time" name="${dia.key}_fechamento" value="${v.horario_fechamento||''}"></div>
    <div><input type="number" min="5" step="5" name="${dia.key}_intervalo" value="${v.intervalo_minutos||30}"></div>
  `;
  form.appendChild(row);
}

async function load() {
  form.innerHTML = '';
  const res = await fetch(`${BASE_URL}/horarios`, { headers:{'X-API-Key': apiKey} });
  const list = res.ok ? await res.json() : [];
  const map = {};
  list.forEach(h => map[(h.dia_semana||'').toLowerCase()] = h);
  DIAS.forEach(d => line(d, map[d.key] || {}));
}
load();

function feedback(t, ok=true){ msg.textContent = t; msg.style.color = ok ? '#10B981' : '#EF4444'; setTimeout(()=>msg.textContent='', 4000); }

saveBtn.addEventListener('click', async (e) => {
  e.preventDefault();
  const horarios = [];

  for (const d of DIAS) {
    const ab = form.querySelector(`[name="${d.key}_abertura"]`).value;
    const fe = form.querySelector(`[name="${d.key}_fechamento"]`).value;
    const it = Number(form.querySelector(`[name="${d.key}_intervalo"]`).value || 30);
    if (ab && fe) {
      horarios.push({
        dia_semana: d.key,
        horario_abertura: ab,
        horario_fechamento: fe,
        intervalo_minutos: it > 0 ? it : 30
      });
    }
  }

  const res = await fetch(`${BASE_URL}/horarios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify({ horarios })
  });

  if (res.ok) feedback('✅ Horários salvos!'); else feedback('❌ Erro ao salvar.', false);
});
