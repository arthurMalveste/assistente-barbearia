module.exports = {
  apps: [
    {
      name: 'chatbot',
      script: 'back-end/chatbot.js',
      cwd: '/opt/barbearia-chatbot',
      watch: false,
      autorestart: true,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
}
