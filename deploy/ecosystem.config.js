// Config do pm2 (história 7.2). Roda no VPS, dentro da pasta do projeto:
//   pm2 start deploy/ecosystem.config.js
//   pm2 save
//   pm2 startup   (segue a instrução impressa por esse comando — registra o pm2 pra subir sozinho no boot)
module.exports = {
  apps: [
    {
      name: 'lead-agent',
      script: 'src/server.js',
      cwd: process.cwd(),
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '1G',
      // pino-roll (histórias 5.1/5.2) já rotaciona os logs da aplicação em
      // LOG_DIR — aqui é só a saída do processo/pm2 em si (crash, restart).
      out_file: 'logs/pm2-out.log',
      error_file: 'logs/pm2-error.log',
      merge_logs: true,
      time: true,
    },
  ],
};
