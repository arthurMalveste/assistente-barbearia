# 💈 Sistema de Agendamento para Barbearia via WhatsApp

Este projeto é um sistema completo de agendamento para barbearias, que combina um **chatbot no WhatsApp** com um **sistema web administrativo** para gestão de agendamentos.

---

## 📌 Funcionalidades Principais

### 1. Chatbot no WhatsApp
- Atendimento automático via WhatsApp:
  - ✅ Agendar horário com seleção de barbeiro e horários disponíveis.
  - ✅ Remarcar ou cancelar horários diretamente pelo WhatsApp.
  - ✅ Envia confirmações automáticas ao cliente.
- Integração com banco de dados SQLite.
- Conexão via **QR Code** no WhatsApp Web.

### 2. Sistema Web Administrativo
- **Calendário Dinâmico** com visão de agendamentos:
  - Visualização por dia, semana e mês.
  - Filtro por barbeiro.
  - Cancelamento de agendamentos diretamente no calendário.
- **QR Code** para reconexão do chatbot.
- (Em desenvolvimento) Gerenciamento de barbeiros e informações da barbearia.

---

## 🗂 Estrutura do Projeto

```
/projeto-barbearia
├── chatbot.js             # Lógica do chatbot WhatsApp
├── server.js              # API REST para gerenciar barbeiros e agendamentos
├── criardb.js             # Script para criar e popular o banco de dados
├── barbearia.db           # Banco de dados SQLite (gerado após rodar criardb.js)
├── /css
│    ├── style.css         # Estilos gerais do sistema web
│    └── calendar.css      # Estilos do calendário
├── /js
│    └── calendar.js       # Lógica do calendário dinâmico
├── index.html             # Página principal com navbar
├── calendar.html          # Página do calendário
├── qrcode.html            # Página para exibir QR Code de conexão
└── barbers.html           # Página placeholder para gerenciar barbeiros
```

---

## ⚙️ Tecnologias Utilizadas
- **Back-end / Chatbot**:
  - [Node.js](https://nodejs.org)
  - [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js)
  - [Express.js](https://expressjs.com)
  - [SQLite3](https://www.sqlite.org/)
  - [Axios](https://axios-http.com)

- **Front-end**:
  - [FullCalendar](https://fullcalendar.io/) (para o calendário dinâmico)
  - HTML5, CSS3 e JavaScript

---

## 🚀 Como Rodar o Projeto

### 1. Clonar o Repositório
```bash
git clone https://seu-repositorio.git
cd projeto-barbearia
```

### 2. Instalar Dependências
```bash
npm install
```

### 3. Criar o Banco de Dados
```bash
node criardb.js
```
Isso cria o arquivo `barbearia.db` com os barbeiros de exemplo.

### 4. Iniciar a API
```bash
node server.js
```
Servidor disponível em:  
👉 `http://localhost:3000`

### 5. Iniciar o Chatbot
```bash
node chatbot.js
```
Escaneie o QR Code exibido no terminal com o WhatsApp da barbearia.

### 6. Abrir o Sistema Web
Abra o arquivo **`index.html`** no navegador.

---

## 📝 Próximas Etapas
- [ ] Concluir o módulo de gerenciamento de barbeiros no sistema web.
- [ ] Adicionar lembretes automáticos para clientes antes do horário marcado.
- [ ] Tornar o sistema multi-barbearia (multiusuários).
- [ ] Hospedar banco de dados e sistema para uso comercial.

---

## 👨‍💻 Autores
- **Arthur Malveste**  
- **Gustavo**  
