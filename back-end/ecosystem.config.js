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
  name: 'barbearia do arthur',
  script: 'chatbot.js',
  instances: 1,
  autorestart: true,
  watch: false,
  max_memory_restart: '300M',
  env: {
    NODE_ENV: 'production',
    API_KEY: '6e5c012e-5591-4caa-b9d8-6b18afc9e98d',
    BARBEARIA_ID: '1', // ID da barbearia
    AUTH_INFO_PATH: 'baileys_auth_info_barbearia_arthur',
    PORT: 3005
  }
},


]
};


  
