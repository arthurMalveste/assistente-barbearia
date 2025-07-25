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

## 👨‍💻 Autores
- **arthurMalveste**  
- **Gustavofarias6342**  
