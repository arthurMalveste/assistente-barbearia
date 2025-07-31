// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'api-barbearia',
      script: 'server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M', // Reinicia se usar mais de 200MB de RAM
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'chatbot-whatsapp',
      script: 'chatbot.js',
      instances: 1,
      autorestart: true,
      watch: false,
      ignore_watch: ["node_modules", "baileys_auth_info"], // <-- LINHA ADICIONADA
      max_memory_restart: '300M', // Um pouco mais de memória para o bot
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};