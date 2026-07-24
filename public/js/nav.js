/* Menu de navegação compartilhado entre as páginas internas (história 8.3).
   Requer <script src="/js/auth.js"> antes deste (usa a função sair()). */

const NAV_ITENS = [
  { pagina: 'inicio', href: '/',            icone: '🏠', label: 'Início' },
  { pagina: 'planos', href: '/planos.html', icone: '🛒', label: 'Planos' },
  { pagina: 'conta',  href: '/conta.html',  icone: '👤', label: 'Minha conta' },
];

/* Monta o menu dentro do elemento `navMenuId`, omitindo o item da própria página
   (mesma convenção que já existia em planos.html — "você está aqui" implícito). */
function montarNav(paginaAtiva, navMenuId = 'navMenu') {
  const el = document.getElementById(navMenuId);
  if (!el) return;
  el.innerHTML = NAV_ITENS
    .filter(item => item.pagina !== paginaAtiva)
    .map(item => `<a class="pill" href="${item.href}">${item.icone} ${item.label}</a>`)
    .join('') +
    `<a class="pill" href="/admin.html" title="Painel Admin" id="pillAdmin" style="display:none">🛠️ Admin</a>` +
    `<button class="pill" onclick="sair()">Sair</button>`;
}

/* Mostra o pill de Admin quando o role vier de /api/me — cada página já busca isso por conta própria. */
function aplicarRoleNav(role) {
  const pill = document.getElementById('pillAdmin');
  if (pill && role === 'admin') pill.style.display = '';
}
