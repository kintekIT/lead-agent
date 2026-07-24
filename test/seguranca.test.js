const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { limitePorUsuario } = require('../src/middleware/seguranca');

// Sobe um Express real (em vez de mockar req/res) porque express-rate-limit
// mexe em headers de resposta por baixo dos panos — mocks finos quebram
// silenciosamente a cada nova versão da lib. Simula o `autenticar` (história
// 0.3) com um middleware fake que lê o uid de um header.
function subirApp() {
  const app = express();
  app.use((req, res, next) => { req.usuario = { id: req.headers['x-uid'] }; next(); });
  app.get('/rota-limitada', limitePorUsuario, (req, res) => res.json({ ok: true }));
  return app;
}

async function chamar(url, uid) {
  return fetch(url, { headers: { 'x-uid': uid } });
}

test('limitePorUsuario bloqueia com 429 depois do limite, mas só para o mesmo usuário', async () => {
  const app = subirApp();
  const servidor = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const url = `http://127.0.0.1:${servidor.address().port}/rota-limitada`;

  try {
    // As 10 primeiras chamadas do usuário A passam (limite configurado em seguranca.js)
    for (let i = 0; i < 10; i++) {
      const res = await chamar(url, 'usuario-a');
      assert.equal(res.status, 200, `chamada ${i + 1} do usuário A deveria passar`);
    }

    // A 11ª chamada do mesmo usuário estoura o limite
    const bloqueada = await chamar(url, 'usuario-a');
    assert.equal(bloqueada.status, 429);
    const corpo = await bloqueada.json();
    assert.match(corpo.erro, /muitas buscas/i);

    // Usuário B não compartilha o balde do usuário A (chave é req.usuario.id, não o IP)
    const outroUsuario = await chamar(url, 'usuario-b');
    assert.equal(outroUsuario.status, 200);
  } finally {
    await new Promise((resolve) => servidor.close(resolve));
  }
});
