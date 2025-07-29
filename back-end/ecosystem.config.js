module.exports = {
  apps: [
    {
      name: 'chatbot-whatsapp',
      script: './chatbot.js',    // caminho para seu arquivo principal
      watch: false,              // setar true se quiser auto-restart ao mudar arquivos
      autorestart: true,         // reinicia se crashar
      max_restarts: 10,
      restart_delay: 3000,       // 3 segundos de delay antes de reiniciar
      env: {
        NODE_ENV: 'production', // faixa de gaza
      },
      env_development: {
        NODE_ENV: 'development',
      },
      error_file: './logs/chatbot-error.log',
      out_file: './logs/chatbot-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    }
  ]
}
