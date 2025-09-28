// chatbot.wait.js
const waitOn = require('wait-on');
const { spawn } = require('child_process');

const HEALTH_URL = process.env.API_HEALTH_URL || 'http://localhost:3000/health';
const TIMEOUT = parseInt(process.env.WAIT_TIMEOUT || '60000', 10); // 60s

(async () => {
  try {
    console.log(`⏳ Aguardando API em: ${HEALTH_URL} (timeout ${TIMEOUT}ms)...`);
    await waitOn({
      resources: [HEALTH_URL],
      timeout: TIMEOUT,
      interval: 1000,
      tcpTimeout: 1000,
      window: 1000,
      validateStatus: (status) => status === 200
    });
    console.log('✅ API pronta. Iniciando chatbot...');
    const child = spawn('node', ['chatbot.js'], {
      stdio: 'inherit',
      env: process.env
    });
    child.on('exit', (code) => process.exit(code ?? 0));
  } catch (err) {
    console.error('❌ API não ficou pronta a tempo:', err?.message || err);
    process.exit(1);
  }
})();
