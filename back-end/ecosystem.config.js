// ecosystem.config.js

module.exports = {
  apps: [
    // ✅ API Web central
    {
      name: 'api-barbearia',
      script: 'server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
      },
    },

    // ✅ Chatbot para Barbearia X
    {
      name: 'chatbot-barbearia-x',
      script: 'chatbot.js',
      instances: 1,
      autorestart: true,
      watch: false,
      ignore_watch: ['node_modules', 'baileys_auth_info'],
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        BARBEARIA_EMAIL: 'x@dominio.com',   // <-- Substitua pelo e-mail real
        BARBEARIA_SENHA: 'senha123', // <-- Substitua pela senha real
        PORT : 3008        
      },
    },

    {
      name: 'chatbot-barbearia-y',
      script: 'chatbot.js',
      instances: 1,
      autorestart: true,
      watch: false,
      ignore_watch: ['node_modules', 'baileys_auth_info'],
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        BARBEARIA_EMAIL: 'y@dominio.com',
        BARBEARIA_SENHA: 'senha456',
        PORT : 3009
      },
    },
  ],
};
