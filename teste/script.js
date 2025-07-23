const feriados = ["01-01", "07-09", "12-10", "15-11", "25-12"];
const horariosDisponiveis = [
  "08:00", "09:00", "10:00", "11:00", "12:00",
  "13:00", "14:00", "15:00", "16:00", "17:00",
  "18:00", "19:00", "20:00"
];

const dataInput = document.getElementById('data');
const horarioSelect = document.getElementById('horario');
const mensagem = document.getElementById('mensagem');

dataInput.addEventListener('change', atualizarHorarios);
document.getElementById('barbeiro').addEventListener('change', atualizarHorarios);

function atualizarHorarios() {
  const data = dataInput.value;
  const barbeiro = document.getElementById('barbeiro').value;
  horarioSelect.innerHTML = "";

  const dia = new Date(data);
  const diaSemana = dia.getDay();
  const hojeFormatado = data.split("-").slice(1).join("-");

  if (diaSemana === 1 || feriados.includes(hojeFormatado)) {
    horarioSelect.innerHTML = '<option value="">Indisponível</option>';
    return;
  }

  const reservas = JSON.parse(localStorage.getItem('reservas')) || [];
  const horariosOcupados = reservas
    .filter(r => r.data === data && r.barbeiro === barbeiro)
    .map(r => r.horario);

  horariosDisponiveis.forEach(h => {
    if (!horariosOcupados.includes(h)) {
      const opt = document.createElement('option');
      opt.value = opt.text = h;
      horarioSelect.appendChild(opt);
    }
  });

  if (!horarioSelect.children.length) {
    horarioSelect.innerHTML = '<option value="">Nenhum horário disponível</option>';
  }
}

document.getElementById('form-agendamento').addEventListener('submit', function (e) {
  e.preventDefault();

  const nome = document.getElementById('nome').value.trim();
  const telefone = document.getElementById('telefone').value.trim();
  const barbeiro = document.getElementById('barbeiro').value;
  const data = dataInput.value;
  const horario = horarioSelect.value;

  const telefoneRegex = /^\(?\d{2}\)?[\s-]?\d{4,5}-?\d{4}$/;
  if (!telefoneRegex.test(telefone)) {
    alert("Telefone inválido. Use o formato (99)99999-9999.");
    return;
  }

  if (!horario) {
    alert("Por favor, selecione um horário válido.");
    return;
  }

  const reserva = { nome, telefone, barbeiro, data, horario };
  const reservas = JSON.parse(localStorage.getItem('reservas')) || [];
  reservas.push(reserva);
  localStorage.setItem('reservas', JSON.stringify(reservas));

  mensagem.innerText = `Reserva confirmada para ${nome} com ${barbeiro} no dia ${data} às ${horario}`;
  setTimeout(() => mensagem.innerText = "", 5000);

  this.reset();
  atualizarHorarios();
});

function mostrarAgendamentos() {
  const reservas = JSON.parse(localStorage.getItem('reservas')) || [];
  const filtroBarbeiro = document.getElementById('filtro-barbeiro').value;
  const filtroData = document.getElementById('filtro-data').value;

  const corpo = document.querySelector('#tabela-agendamentos tbody');
  corpo.innerHTML = "";

  reservas.forEach((r, index) => {
    if ((filtroBarbeiro === "" || r.barbeiro === filtroBarbeiro) &&
      (filtroData === "" || r.data === filtroData)) {

      const linha = document.createElement('tr');
      linha.innerHTML = `
        <td>${r.nome}</td>
        <td>${r.telefone}</td>
        <td>${r.barbeiro}</td>
        <td>${r.data}</td>
        <td>${r.horario}</td>
        <td><button onclick="cancelarReserva(${index})">Cancelar</button></td>
      `;
      corpo.appendChild(linha);
    }
  });
}

function cancelarReserva(index) {
  const reservas = JSON.parse(localStorage.getItem('reservas')) || [];
  const confirmacao = confirm(`Deseja cancelar a reserva de ${reservas[index].nome} no dia ${reservas[index].data}?`);

  if (confirmacao) {
    reservas.splice(index, 1);
    localStorage.setItem('reservas', JSON.stringify(reservas));
    mostrarAgendamentos();
    atualizarHorarios();
    alert("Reserva cancelada com sucesso.");
  }
}
