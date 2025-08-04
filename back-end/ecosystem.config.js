// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'api-barbearia',
      script: 'server.js',
      instances: 1,
      autorestart: true,
      watch: true, // Habilita o watch para desenvolvimento
      ignore_watch: ['node_modules', 'db', 'baileys_auth_info_barbearia_*'],
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      }
    },
    {
      name: 'chatbot-barbearia-authentic',
      script: 'chatbot.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        API_KEY: '98ef615c-4d70-4f63-81bd-59c3c9070576',
        BARBEARIA_ID: '1',
        AUTH_INFO_PATH: 'baileys_auth_info_barbearia_1',
        PORT: 3005
      }
    },
    {
      name: 'chatbot-barbearia-imperio',
      script: 'chatbot.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        API_KEY: 'e657e3a2-c73c-407c-a8f9-5c7ca0be252e', // ⬅️ Chave da segunda barbearia
        BARBEARIA_ID: '2',
        AUTH_INFO_PATH: 'baileys_auth_info_barbearia_2',
        PORT: 3006
      }
    }
  ]
};
  
