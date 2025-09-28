// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'api-barbearia',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: true, // manter apenas em desenvolvimento
      ignore_watch: ['node_modules', 'db', 'baileys_auth_info_barbearia_*'],
      max_memory_restart: '200M',

      // 🔽 Permite PM2 esperar o "ready" do server.js
      wait_ready: true,
      listen_timeout: 10000,      // até 10s para enviar "ready"
      kill_timeout: 5000,

      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    },

    {
      // Observação: renomeei o processo para padrão sem espaços
      name: 'chatbot-arthur',
      script: 'chatbot.wait.js',   // 🔴 inicia pelo bootstrap que espera a API
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      exp_backoff_restart_delay: 2000, // backoff exponencial

      env: {
        NODE_ENV: 'production',
        API_KEY: '6e5c012e-5591-4caa-b9d8-6b18afc9e98d',
        BARBEARIA_ID: '1',
        AUTH_INFO_PATH: 'baileys_auth_info_barbearia_arthur',
        PORT: 3005,                // porta do Express interno do bot
        // 🔽 URL usada pelo bootstrap para esperar a API
        API_HEALTH_URL: 'http://localhost:3000/health',
        WAIT_TIMEOUT: 60000
      }
    }
  ]
};
