// ======================================================
// barbers-ui.js - VERSÃO CORRIGIDA E FINAL
// ======================================================

// --- Constantes de Configuração ---
// Chave da "Barbearia Cliente 2" para testes.
const apiKey = '786c30c9-b215-4e00-94f6-929a6a13acf8';
const BASE_URL = 'http://localhost:3000';

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
    setTimeout(() => { element.textContent = ''; }, 5000);
}

function openEditModal(id, nomeAtual, telefoneAtual) {
    if (editBarberModal && editBarberId && editBarberName && editBarberPhone) {
        editBarberId.value = id;
        editBarberName.value = nomeAtual;
        editBarberPhone.value = telefoneAtual || ''; // Garante que não seja 'undefined'
        editBarberModal.style.display = 'block';
    }
}

// --- Funções de API ---

// Carrega a lista de barbeiros
async function loadBarbers() {
    if (!barbersListContainer) return;
    barbersListContainer.innerHTML = 'Carregando...';
    try {
        const res = await fetch(`${BASE_URL}/barbers`, {
            headers: { 'X-API-Key': apiKey }
        });

        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || 'Falha ao carregar barbeiros.');
        }

        const barbers = await res.json();
        if (barbers.length === 0) {
            barbersListContainer.innerHTML = '<p>Nenhum barbeiro cadastrado para esta barbearia.</p>';
            return;
        }

        barbersListContainer.innerHTML = barbers.map(barber => `
            <div class="card barber-card">
                <div>
                    <h4>${barber.nome}</h4>
                    <p>${barber.telefone || 'Telefone não cadastrado'}</p>
                </div>
                <div class="card-actions">
                    <button class="edit-btn" onclick="openEditModal('${barber.id}', '${barber.nome}', '${barber.telefone}')">✏️ Editar</button>
                    <button class="delete-btn" onclick="deleteBarber('${barber.id}')">🗑️ Excluir</button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        showFeedback(message, `❌ Erro ao carregar barbeiros: ${err.message}`, true);
        console.error(err);
    }
}

// Adiciona um novo barbeiro
async function handleAddBarber(e) {
    e.preventDefault();
    const nome = document.getElementById('nome').value;
    const telefone = document.getElementById('telefone').value;

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
            showFeedback(message, '✅ Barbeiro cadastrado com sucesso!');
            barberForm.reset();
            loadBarbers();
        } else {
            const error = await res.json();
            showFeedback(message, `❌ Erro ao cadastrar barbeiro: ${error.error}`, true);
        }
    } catch (err) {
        showFeedback(message, '❌ Erro ao conectar com o servidor.', true);
        console.error(err);
    }
}

// Edita um barbeiro existente
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

// Exclui um barbeiro
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
window.deleteBarber = deleteBarber; // Expondo a função para o escopo global para o onclick funcionar

// Carrega informações da barbearia
async function loadInfo() {
    if (!infoForm) return;
    try {
        const res = await fetch(`${BASE_URL}/config`, {
            headers: { 'X-API-Key': apiKey }
        });
        const data = await res.json();
        document.getElementById('endereco').value = data.endereco || '';
        document.getElementById('sobre').value = data.descricao || '';
    } catch (err) {
        showFeedback(infoMessage, '❌ Erro ao carregar informações.', true);
        console.error(err);
    }
}

// Salva as configurações
async function handleSaveInfo(e) {
    e.preventDefault();
    const descricao = document.getElementById('sobre').value;
    const endereco = document.getElementById('endereco').value;
    try {
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

// --- Inicialização e Event Listeners (VERSÃO CORRIGIDA) ---
document.addEventListener('DOMContentLoaded', () => {
    // Carrega os dados iniciais ao carregar a página
    loadBarbers();
    loadInfo();

    // Adiciona o evento para fechar o modal
    if (closeEditModalBtn) {
        closeEditModalBtn.addEventListener('click', () => {
            if (editBarberModal) {
                editBarberModal.style.display = 'none';
            }
        });
    }

    // Adiciona os eventos de submit para os formulários
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