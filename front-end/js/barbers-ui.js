// --- Constantes de Configuração ---
// Use a mesma API Key que você tem no seu banco de dados para a barbearia 2
const apiKey = '98ef615c-4d70-4f63-81bd-59c3c9070576';
// O ID da barbearia não é mais necessário nas URLs, pois a API o obtém da chave
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

// --- Funções de Feedback e UI ---
function showFeedback(element, text, isError = false) {
    element.textContent = text;
    element.style.color = isError ? '#EF4444' : '#10B981';
    setTimeout(() => { element.textContent = '', 5000; });
}

function openEditModal(id, nomeAtual, telefoneAtual) {
    editBarberId.value = id;
    editBarberName.value = nomeAtual;
    editBarberPhone.value = telefoneAtual;
    editBarberModal.style.display = 'block';
}

// --- Funções de API ---

// Carrega a lista de barbeiros
async function loadBarbers() {
    barbersListContainer.innerHTML = 'Carregando...';
    try {
        // Rota corrigida: usa /barbers e envia a API key no cabeçalho
        const res = await fetch(`${BASE_URL}/barbers`, {
            headers: { 'X-API-Key': apiKey }
        });

        if (!res.ok) {
            throw new Error('Falha ao carregar barbeiros.');
        }

        const barbers = await res.json();

        if (barbers.length === 0) {
            barbersListContainer.innerHTML = '<p>Nenhum barbeiro cadastrado.</p>';
            return;
        }

        barbersListContainer.innerHTML = barbers.map(barber => `
            <div class="card barber-card">
                <div>
                    <h4>${barber.nome}</h4>
                    <p>${barber.telefone}</p>
                </div>
                <div class="card-actions">
                    <button class="edit-btn" onclick="openEditModal('${barber.id}', '${barber.nome}', '${barber.telefone}')">✏️ Editar</button>
                    <button class="delete-btn" onclick="deleteBarber('${barber.id}')">🗑️ Excluir</button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        showFeedback(message, '❌ Erro ao carregar barbeiros. Verifique sua conexão com a API e as configurações.', true);
        console.error(err);
    }
}

// Adiciona um novo barbeiro
async function handleAddBarber(e) {
    e.preventDefault();
    const nome = document.getElementById('nome').value;
    const telefone = document.getElementById('telefone').value;

    try {
        // Rota corrigida: usa /barbers e envia a API key no cabeçalho
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
            loadBarbers(); // Recarrega a lista
        } else {
            const error = await res.json();
            showFeedback(message, `❌ Erro ao cadastrar barbeiro: ${error.error}`, true);
        }
    } catch (err) {
        showFeedback(message, '❌ Erro ao conectar com o servidor. Verifique se a API está rodando e se as configurações estão corretas.', true);
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
        // Rota corrigida: usa /barbers/:id e envia a API key no cabeçalho
        const res = await fetch(`${BASE_URL}/barbers/${id}`, {
            method: 'PUT', // Seu backend usa PUT, mas PATCH também é comum. Corrigi para PUT.
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
window.deleteBarber = async (id) => {
    // Implementei um modal de confirmação simples, já que o original estava comentado.
    if (!window.confirm('Tem certeza que deseja excluir este barbeiro?')) {
        return;
    }

    try {
        // Rota corrigida: usa /barbers/:id e envia a API key no cabeçalho
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
};

// Carrega informações da barbearia
async function loadInfo() {
    try {
        // Rota corrigida: usa /config e envia a API key no cabeçalho
        const res = await fetch(`${BASE_URL}/config`, {
            headers: { 'X-API-Key': apiKey }
        });
        const data = await res.json();
        document.getElementById('endereco').value = data.endereco || '';
        document.getElementById('sobre').value = data.descricao || '';
    } catch (err) {
        showFeedback(infoMessage, '❌ Erro ao carregar informações. Verifique sua conexão com a API e as configurações.', true);
        console.error(err);
    }
}

// Salva as configurações
async function handleSaveInfo(e) {
    e.preventDefault();
    const descricao = document.getElementById('sobre').value;
    const endereco = document.getElementById('endereco').value;

    try {
        // Rota corrigida: usa /config e envia a API key no cabeçalho
        // A API espera uma requisição POST para a rota /config com chave e valor no corpo.
        // O seu frontend envia os campos "endereco" e "descricao".
        // A API, no entanto, espera "chave" e "valor" e um POST na rota /config.
        // Vou adaptar a chamada do frontend para fazer duas requisições, uma para cada campo,
        // ou você pode modificar sua API para receber um objeto com "endereco" e "descricao".
        // A maneira mais simples no momento é fazer duas chamadas.

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
        showFeedback(infoMessage, '❌ Erro ao salvar informações. Verifique sua conexão com a API e as configurações.', true);
        console.error(err);
    }
}

// Inicialização e Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Carrega dados iniciais
    loadBarbers();
    loadInfo();
    
    // Adiciona event listeners somente após o DOM carregar
    if (barberForm) {
        barberForm.addEventListener('submit', handleAddBarber);
    }
    if (editBarberForm) {
        editBarberForm.addEventListener('submit', handleEditBarber);
    }
    if (infoForm) {
        infoForm.addEventListener('submit', handleSaveInfo);
    }

    const closeEditModalBtn = document.getElementById('closeEditModal');
    if (closeEditModalBtn) {
        closeEditModalBtn.addEventListener('click', () => {
            editBarberModal.style.display = 'none';
        });
    }
});
