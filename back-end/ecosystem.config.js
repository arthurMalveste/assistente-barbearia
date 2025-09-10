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
  name: 'barbearia joao',
  script: 'chatbot.js',
  instances: 1,
  autorestart: true,
  watch: false,
  max_memory_restart: '300M',
  env: {
    NODE_ENV: 'production',
    API_KEY: 'f85531c5-7c6a-4c5a-9959-7a76b60a5c09',
    BARBEARIA_ID: '1', // ID da barbearia
    AUTH_INFO_PATH: 'baileys_auth_info_barbearia_joao',
    PORT: 3005
  }
},

{
  name: 'barbearia gabriel',
  script: 'chatbot.js',
  instances: 1,
  autorestart: true,
  watch: false,
  max_memory_restart: '300M',
  env: {
    NODE_ENV: 'production',
    API_KEY: '8a687d50-6bd5-4102-a7f7-d83ec3ddad2b',
    BARBEARIA_ID: '2', // ID da barbearia
    AUTH_INFO_PATH: 'baileys_auth_info_barbearia_gabriel',
    PORT: 3006
  }
},



  ]
};


  
