// ======================================================
// barbers-ui.js - VERSÃO ATUALIZADA
// ======================================================

// --- Constantes de Configuração ---
const apiKey = localStorage.getItem('apiKey');
const BASE_URL = 'http://localhost:3000';

if (!apiKey) {
    console.error('Chave API não encontrada. Redirecionando para o login.');
    window.location.href = 'login.html';
}

// --- Elementos do DOM ---
const barberForm = document.getElementById('barberForm');
const barbersListContainer = document.getElementById('barbersListContainer');
const message = document.getElementById('message');
const infoForm = document.getElementById('infoForm');
const infoMessage = document.getElementById('infoMessage');
const editBarberModal = document.getElementById('editBarberModal');
const editBarberForm = document.getElementById('editBarberForm');
const editBarberId = document.getElementById('editBarberId');
const editBarberName = document.getElementById('editBarberName');
const editBarberPhone = document.getElementById('editBarberPhone');
const closeEditModalBtn = document.getElementById('closeEditModal');

// --- Funções de Feedback e UI ---
function showFeedback(element, text, isError = false) {
    element.textContent = text;
    element.style.color = isError ? '#EF4444' : '#10B981';
    setTimeout(() => {
        element.textContent = '';
    }, 5000);
}

function openEditModal(id, nomeAtual, telefoneAtual) {
    if (editBarberId && editBarberName && editBarberPhone && editBarberModal) {
        editBarberId.value = id;
        editBarberName.value = nomeAtual;
        editBarberPhone.value = telefoneAtual;
        editBarberModal.style.display = 'block';
    }
}
window.openEditModal = openEditModal; // Torna a função acessível globalmente

// --- Funções de Lógica ---
async function loadBarbers() {
    try {
        const res = await fetch(`${BASE_URL}/barbers`, {
            headers: { 'X-API-Key': apiKey }
        });
        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error);
        }
        const barbers = await res.json();
        barbersListContainer.innerHTML = '';
        if (barbers.length === 0) {
            barbersListContainer.innerHTML = '<p class="text-gray-500">Nenhum barbeiro cadastrado.</p>';
        } else {
            barbers.forEach(barber => {
                const barberCard = document.createElement('div');
                barberCard.className = 'barber-card';
                barberCard.innerHTML = `
                    <p class="font-semibold text-lg">${barber.nome}</p>
                    <p class="text-gray-600">${barber.telefone || 'N/A'}</p>
                    <div class="actions">
                        <button onclick="openEditModal(${barber.id}, '${barber.nome}', '${barber.telefone}')" class="edit-btn">✏️ Editar</button>
                        <button onclick="deleteBarber(${barber.id})" class="delete-btn">🗑️ Excluir</button>
                    </div>
                `;
                barbersListContainer.appendChild(barberCard);
            });
        }
    } catch (err) {
        showFeedback(message, `❌ Erro ao carregar barbeiros: ${err.message}`, true);
        console.error(err);
    }
}

async function handleAddBarber(e) {
    e.preventDefault();
    const nome = e.target.nome.value;
    const telefone = e.target.telefone.value;

    try {
        const res = await fetch(`${BASE_URL}/barbers`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey
            },
            body: JSON.stringify({ nome, telefone })
        });

        if (res.ok) {
            showFeedback(message, '✅ Barbeiro adicionado com sucesso!');
            barberForm.reset();
            loadBarbers();
        } else {
            const error = await res.json();
            showFeedback(message, `❌ Erro ao adicionar barbeiro: ${error.error}`, true);
        }
    } catch (err) {
        showFeedback(message, '❌ Erro ao conectar com o servidor.', true);
        console.error(err);
    }
}

async function handleEditBarber(e) {
    e.preventDefault();
    const id = editBarberId.value;
    const nome = editBarberName.value;
    const telefone = editBarberPhone.value;

    try {
        const res = await fetch(`${BASE_URL}/barbers/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey
            },
            body: JSON.stringify({ nome, telefone })
        });

        if (res.ok) {
            showFeedback(message, '✅ Barbeiro atualizado com sucesso!');
            editBarberModal.style.display = 'none';
            loadBarbers();
        } else {
            const error = await res.json();
            showFeedback(message, `❌ Erro ao atualizar barbeiro: ${error.error}`, true);
        }
    } catch (err) {
        showFeedback(message, '❌ Erro ao conectar com o servidor.', true);
        console.error(err);
    }
}

async function deleteBarber(id) {
    if (!window.confirm('Tem certeza que deseja excluir este barbeiro?')) {
        return;
    }
    try {
        const res = await fetch(`${BASE_URL}/barbers/${id}`, {
            method: 'DELETE',
            headers: { 'X-API-Key': apiKey }
        });

        if (res.ok) {
            showFeedback(message, '✅ Barbeiro excluído com sucesso!');
            loadBarbers();
        } else {
            const error = await res.json();
            showFeedback(message, `❌ Erro ao excluir barbeiro: ${error.error}`, true);
        }
    } catch (err) {
        showFeedback(message, '❌ Erro ao conectar com o servidor.', true);
        console.error(err);
    }
}
window.deleteBarber = deleteBarber;

// Função para carregar as informações da barbearia
async function loadInfo() {
    try {
        const res = await fetch(`${BASE_URL}/config`, {
            headers: { 'X-API-Key': apiKey }
        });
        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error);
        }
        const config = await res.json();
        document.getElementById('nome').value = config.nome || '';
        document.getElementById('endereco').value = config.endereco || '';
        document.getElementById('sobre').value = config.descricao || '';
    } catch (err) {
        showFeedback(infoMessage, `❌ Erro ao carregar informações: ${err.message}`, true);
        console.error(err);
    }
}

// Função para salvar as informações da barbearia
async function handleSaveInfo(e) {
    e.preventDefault();
    const nome = document.getElementById('nome').value;
    const endereco = document.getElementById('endereco').value;
    const descricao = document.getElementById('sobre').value;

    try {
        // Envia as informações em requisições separadas
        await fetch(`${BASE_URL}/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
            body: JSON.stringify({ chave: 'nome', valor: nome })
        });
        await fetch(`${BASE_URL}/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
            body: JSON.stringify({ chave: 'endereco', valor: endereco })
        });
        await fetch(`${BASE_URL}/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
            body: JSON.stringify({ chave: 'descricao', valor: descricao })
        });
        showFeedback(infoMessage, '✅ Informações salvas com sucesso!');
    } catch (err) {
        showFeedback(infoMessage, '❌ Erro ao salvar informações.', true);
        console.error(err);
    }
}

// --- Inicialização e Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    loadBarbers();
    loadInfo();

    if (closeEditModalBtn) {
        closeEditModalBtn.addEventListener('click', () => {
            if (editBarberModal) {
                editBarberModal.style.display = 'none';
            }
        });
    }

    if (barberForm) {
        barberForm.addEventListener('submit', handleAddBarber);
    }
    if (editBarberForm) {
        editBarberForm.addEventListener('submit', handleEditBarber);
    }
    if (infoForm) {
        infoForm.addEventListener('submit', handleSaveInfo);
    }
});
