const barberForm = document.getElementById('barberForm');
const barbersListContainer = document.getElementById('barbersListContainer');
const message = document.getElementById('message');

const infoForm = document.getElementById('infoForm');
const infoMessage = document.getElementById('infoMessage');

// Verifica o token JWT
const token = localStorage.getItem('token');
if (!token) {
  window.location.href = 'login.html';
}

const authHeader = {
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  }
};

// Carrega barbeiros
async function loadBarbersList() {
  try {
    const res = await fetch('http://localhost:3000/barbers', authHeader);
    const barbers = await res.json();

    if (!barbers.length) {
      barbersListContainer.innerHTML = '<p class="empty">Nenhum barbeiro cadastrado.</p>';
      return;
    }

    barbersListContainer.innerHTML = '';
    barbers.forEach(({ id, nome, telefone }) => {
      const div = document.createElement('div');
      div.className = 'barber-item';
      div.innerHTML = `
        <span><strong>${nome}</strong><br><small>${telefone || ''}</small></span>
        <div>
          <button class="edit" onclick="editBarber(${id}, '${nome}', '${telefone || ''}')">&#9998;</button>
          <button class="delete" onclick="deleteBarber(${id})">&#128465;</button>
        </div>
      `;
      barbersListContainer.appendChild(div);
    });
  } catch (err) {
    barbersListContainer.innerHTML = '<p class="error">Erro ao carregar barbeiros.</p>';
  }
}

// Submete novo barbeiro
barberForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nome = document.getElementById('nome').value;
  const telefone = document.getElementById('telefone').value;

  try {
    const res = await fetch('http://localhost:3000/barbers', {
      method: 'POST',
      ...authHeader,
      body: JSON.stringify({ nome, telefone })
    });
    const result = await res.json();
    if (res.ok) {
      message.textContent = '✅ Barbeiro cadastrado com sucesso!';
      barberForm.reset();
      loadBarbersList();
    } else {
      message.textContent = '❌ Erro: ' + result.error;
    }
  } catch (err) {
    message.textContent = '❌ Erro ao conectar ao servidor.';
  }
});

// Edita barbeiro
function editBarber(id, nomeAntigo, telefoneAntigo) {
  const novoNome = prompt('Editar nome do barbeiro:', nomeAntigo);
  const novoTelefone = prompt('Editar telefone:', telefoneAntigo || '');

  if (novoNome) {
    fetch(`http://localhost:3000/barbers/${id}`, {
      method: 'PUT',
      ...authHeader,
      body: JSON.stringify({ nome: novoNome, telefone: novoTelefone })
    }).then(loadBarbersList);
  }
}

// Deleta barbeiro
async function deleteBarber(id) {
  if (!confirm('Deseja remover este barbeiro?')) return;
  try {
    await fetch(`http://localhost:3000/barbers/${id}`, {
      method: 'DELETE',
      ...authHeader
    });
    loadBarbersList();
  } catch (err) {
    alert('Erro ao remover barbeiro.');
  }
}

// Carrega info da barbearia
async function loadBarberInfo() {
  try {
    const res = await fetch('http://localhost:3000/config', authHeader);
    const data = await res.json();
    document.getElementById('endereco').value = data.endereco || '';
    document.getElementById('sobre').value = data.descricao || '';
  } catch (err) {
    infoMessage.textContent = '❌ Erro ao carregar informações.';
  }
}

// Salva info da barbearia
infoForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const endereco = document.getElementById('endereco').value;
  const sobre = document.getElementById('sobre').value;

  try {
    const res1 = await fetch('http://localhost:3000/config', {
      method: 'POST',
      ...authHeader,
      body: JSON.stringify({ chave: 'endereco', valor: endereco })
    });
    const res2 = await fetch('http://localhost:3000/config', {
      method: 'POST',
      ...authHeader,
      body: JSON.stringify({ chave: 'descricao', valor: sobre })
    });

    infoMessage.textContent = (res1.ok && res2.ok)
      ? '✅ Informações atualizadas com sucesso.'
      : '❌ Falha ao salvar.';
  } catch (err) {
    infoMessage.textContent = '❌ Erro ao conectar ao servidor.';
  }
});

// Inicialização
loadBarbersList();
loadBarberInfo();
