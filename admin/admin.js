/* =========================================================
   PAINEL IVAN MOTOS
   - Login: a senha decifra (no navegador) o token do GitHub
     guardado em admin/usuarios.json.
   - Edição: as mudanças ficam na tela até clicar em "Publicar".
   - Publicar: um único commit com os JSON e as fotos novas.
   ========================================================= */
const CONFIG = { owner: 'orbedigital-sites', repo: 'IvanMotos', branch: 'main' };

const TIPOS = {
  motos: {
    path: 'data/motos.json', chave: 'motos', pasta: 'assets/motos', maxLado: 1600,
    singular: 'moto',
    dica: 'A ordem aqui é a ordem em que as motos aparecem no site.',
    campos: [
      { k: 'nome',   l: 'Nome da moto', req: true, ph: 'Honda CG 160', largo: true },
      { k: 'tipo',   l: 'Tipo', ops: [['nova', 'Nova'], ['usada', 'Usada']] },
      { k: 'ano',    l: 'Ano', ph: '2026' },
      { k: 'km',     l: 'Km / estado', ph: '0 km, Revisada…' },
      { k: 'cambio', l: 'Câmbio', ph: '5 marchas' },
      { k: 'preco',  l: 'Preço', ph: 'Consulte, R$ 14.990…', padrao: 'Consulte' },
      { k: 'obs',    l: 'Destaque', ph: 'Entrada facilitada' },
    ],
    resumo: m => `<span class="tag ${m.tipo === 'usada' ? 'usada' : 'nova'}">${m.tipo === 'usada' ? 'Usada' : 'Nova'}</span>${esc([m.ano, m.km, m.cambio].filter(Boolean).join(' · '))}<br>${esc(m.preco)}${m.obs ? ' — ' + esc(m.obs) : ''}`,
  },
  clientes: {
    path: 'data/clientes.json', chave: 'clientes', pasta: 'assets/clientes', maxLado: 1200,
    singular: 'foto de cliente',
    dica: 'Fotos das entregas, exibidas no carrossel "Clientes Ivan Motos".',
    campos: [
      { k: 'nome', l: 'Nome do cliente', req: true, ph: 'João', largo: true },
      { k: 'moto', l: 'Legenda', ph: 'Levou uma CG 160', largo: true },
    ],
    resumo: c => esc(c.moto),
  },
};

/* ---------- Estado ---------- */
const S = {
  token: null, usuario: null, aba: 'motos',
  dados: { motos: [], clientes: [] },
  original: { motos: '', clientes: '' },   // JSON carregado, para saber o que mudou
  shas: { motos: null, clientes: null },   // versão do arquivo no GitHub (detecta conflito)
  fotosNovas: new Map(),                   // caminho -> { base64, url } ainda não publicadas
  previas: new Map(),                      // caminho -> url local (foto recém-publicada)
  fotosRemovidas: new Set(),               // caminhos de fotos que saíram do site
  editando: null, fotoForm: null,
};

/* ---------- Utilidades ---------- */
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const b64ParaBytes = b64 => Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0));
function bytesParaB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const textoParaB64 = t => bytesParaB64(new TextEncoder().encode(t));
const b64ParaTexto = b => new TextDecoder().decode(b64ParaBytes(b));
const slug = t => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'foto';
const urlFoto = p => S.fotosNovas.get(p)?.url || S.previas.get(p) || '../' + p;

let toastTimer;
function toast(msg, tipo = 'ok', ms = 3500) {
  const t = $('#toast');
  t.textContent = msg; t.className = `toast on ${tipo}`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), ms);
}

/* ---------- Login ---------- */
async function decifrarToken(reg, senha) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveKey']);
  const chave = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: b64ParaBytes(reg.salt), iterations: reg.iter, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ParaBytes(reg.iv) }, chave, b64ParaBytes(reg.token));
  return new TextDecoder().decode(claro);
}

$('#form-login').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, btn = f.querySelector('button'), erro = $('#login-erro');
  const usuario = f.usuario.value.trim().toLowerCase(), senha = f.senha.value;
  erro.textContent = ''; btn.disabled = true; btn.textContent = 'Entrando…';
  try {
    const r = await fetch('usuarios.json', { cache: 'no-store' });
    const lista = r.ok ? (await r.json()).usuarios || [] : [];
    const reg = lista.find(u => u.usuario === usuario);
    let token = null;
    if (reg) { try { token = await decifrarToken(reg, senha); } catch { /* senha errada */ } }
    if (!token) throw new Error('Usuário ou senha incorretos.');
    S.token = token; S.usuario = usuario;
    await carregarDados();
    try { sessionStorage.setItem('ivan-admin', JSON.stringify({ token, usuario })); } catch {}
    f.reset();
    abrirPainel();
  } catch (err) {
    S.token = null;
    erro.textContent = err.status === 401
      ? 'O acesso do painel ao GitHub expirou ou foi revogado. Fale com o responsável pelo site.'
      : err.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Entrar';
  }
});

$('#sair').addEventListener('click', () => {
  if (temAlteracoes() && !confirm('Existem alterações não publicadas. Sair mesmo assim?')) return;
  try { sessionStorage.removeItem('ivan-admin'); } catch {}
  location.reload();
});

function abrirPainel() {
  $('#tela-login').hidden = true; $('#tela-painel').hidden = false;
  $('#nome-usuario').textContent = S.usuario;
  render();
}

/* ---------- GitHub ---------- */
async function gh(caminho, opts = {}) {
  const r = await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}${caminho}`, {
    cache: 'no-store', ...opts,
    headers: {
      Authorization: `Bearer ${S.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!r.ok) {
    let info = {}; try { info = await r.json(); } catch {}
    const e = new Error(info.message || `Erro ${r.status} no GitHub`); e.status = r.status; throw e;
  }
  return r.status === 204 ? null : r.json();
}

async function lerArquivo(tipo) {
  const t = TIPOS[tipo];
  try {
    const r = await gh(`/contents/${t.path}?ref=${CONFIG.branch}`);
    const json = JSON.parse(b64ParaTexto(r.content));
    return { lista: Array.isArray(json[t.chave]) ? json[t.chave] : [], sha: r.sha };
  } catch (e) {
    if (e.status === 404) return { lista: [], sha: null };
    throw e;
  }
}

async function carregarDados() {
  const [m, c] = await Promise.all([lerArquivo('motos'), lerArquivo('clientes')]);
  for (const [tipo, r] of [['motos', m], ['clientes', c]]) {
    S.dados[tipo] = r.lista; S.shas[tipo] = r.sha; S.original[tipo] = JSON.stringify(r.lista);
  }
  S.fotosNovas.clear(); S.fotosRemovidas.clear();
}

/* Grava vários arquivos num único commit (Git Data API). */
async function commitar(arquivos, mensagem) {
  const ref = await gh(`/git/ref/heads/${CONFIG.branch}`);
  const base = ref.object.sha;
  const commitBase = await gh(`/git/commits/${base}`);
  const tree = [];
  for (const a of arquivos) {
    if (a.apagar) { tree.push({ path: a.path, mode: '100644', type: 'blob', sha: null }); continue; }
    const blob = await gh('/git/blobs', { method: 'POST', body: JSON.stringify({ content: a.base64, encoding: 'base64' }) });
    tree.push({ path: a.path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  const novaArvore = await gh('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: commitBase.tree.sha, tree }) });
  const novo = await gh('/git/commits', { method: 'POST', body: JSON.stringify({ message: mensagem, tree: novaArvore.sha, parents: [base] }) });
  await gh(`/git/refs/heads/${CONFIG.branch}`, { method: 'PATCH', body: JSON.stringify({ sha: novo.sha }) });
}

/* ---------- Alterações ---------- */
const alterado = tipo => JSON.stringify(S.dados[tipo]) !== S.original[tipo];
const temAlteracoes = () => alterado('motos') || alterado('clientes');
const fotoEmUso = p => S.dados.motos.some(m => m.foto === p) || S.dados.clientes.some(c => c.foto === p);

function soltarFoto(p) {
  if (!p) return;
  if (S.fotosNovas.has(p)) {
    if (!fotoEmUso(p)) { URL.revokeObjectURL(S.fotosNovas.get(p).url); S.fotosNovas.delete(p); }
  } else if (p.startsWith('assets/motos/') || p.startsWith('assets/clientes/')) {
    S.fotosRemovidas.add(p);
  }
}

$('#publicar').addEventListener('click', async () => {
  const btn = $('#publicar'); btn.disabled = true; btn.textContent = 'Publicando…';
  try {
    const tipos = ['motos', 'clientes'].filter(alterado);
    // Conflito: alguém publicou depois que esta tela foi carregada?
    for (const tipo of tipos) {
      const atual = await lerArquivo(tipo);
      if (atual.sha !== S.shas[tipo]) {
        toast('Outra pessoa publicou alterações enquanto você editava. Recarregue a página (suas alterações não salvas serão perdidas).', 'err', 9000);
        return;
      }
    }
    const arquivos = tipos.map(tipo => ({
      path: TIPOS[tipo].path,
      base64: textoParaB64(JSON.stringify({ [TIPOS[tipo].chave]: S.dados[tipo] }, null, 2) + '\n'),
    }));
    for (const [p, f] of S.fotosNovas) if (fotoEmUso(p)) arquivos.push({ path: p, base64: f.base64 });
    for (const p of S.fotosRemovidas) if (!fotoEmUso(p) && !S.fotosNovas.has(p)) arquivos.push({ path: p, apagar: true });

    const oque = tipos.map(t => t === 'motos' ? 'catálogo' : 'clientes').join(' e ');
    await commitar(arquivos, `Painel: atualiza ${oque} (por ${S.usuario})`);

    for (const [p, f] of S.fotosNovas) S.previas.set(p, f.url); // mantém a prévia até o site republicar
    S.fotosNovas.clear();
    await carregarDados();
    render();
    toast('Publicado! O site é atualizado em 1 a 2 minutos.', 'ok', 6000);
  } catch (e) {
    toast(e.status === 401 ? 'O acesso ao GitHub expirou. Fale com o responsável pelo site.'
      : e.status === 422 || e.status === 409 ? 'Conflito ao publicar: recarregue a página e tente de novo.'
      : 'Não foi possível publicar: ' + e.message, 'err', 9000);
  } finally {
    btn.disabled = false; btn.textContent = 'Publicar no site';
  }
});

$('#descartar').addEventListener('click', async () => {
  if (!confirm('Descartar todas as alterações não publicadas?')) return;
  for (const f of S.fotosNovas.values()) URL.revokeObjectURL(f.url);
  for (const tipo of ['motos', 'clientes']) S.dados[tipo] = JSON.parse(S.original[tipo]);
  S.fotosNovas.clear(); S.fotosRemovidas.clear();
  render();
});

addEventListener('beforeunload', e => { if (S.token && temAlteracoes()) { e.preventDefault(); e.returnValue = ''; } });

/* ---------- Lista ---------- */
$$('.abas button').forEach(b => b.addEventListener('click', () => { S.aba = b.dataset.aba; render(); }));

function render() {
  const tipo = S.aba, t = TIPOS[tipo], lista = S.dados[tipo];
  $$('.abas button').forEach(b => b.classList.toggle('on', b.dataset.aba === tipo));
  $('#n-motos').textContent = `(${S.dados.motos.length})`;
  $('#n-clientes').textContent = `(${S.dados.clientes.length})`;
  $('#adicionar').textContent = `+ Adicionar ${t.singular}`;
  $('#dica').textContent = t.dica;
  $('#lista').innerHTML = lista.length ? lista.map((it, i) => `
    <div class="item ${tipo}">
      ${it.foto ? `<img src="${esc(urlFoto(it.foto))}" alt="">` : '<div class="sem"></div>'}
      <div><h3>${esc(it.nome)}</h3><p>${t.resumo(it)}</p></div>
      <div class="item-acoes">
        <button class="ico" data-acao="subir" data-i="${i}" title="Mover para cima" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="ico" data-acao="descer" data-i="${i}" title="Mover para baixo" ${i === lista.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="ico" data-acao="editar" data-i="${i}" title="Editar">✎</button>
        <button class="ico del" data-acao="excluir" data-i="${i}" title="Excluir">✕</button>
      </div>
    </div>`).join('')
    : `<p class="vazio">Nada cadastrado ainda. Clique em “+ Adicionar ${t.singular}”.</p>`;
  $('#pendente').hidden = !temAlteracoes();
}

$('#lista').addEventListener('click', e => {
  const b = e.target.closest('button[data-acao]'); if (!b) return;
  const lista = S.dados[S.aba], i = +b.dataset.i;
  switch (b.dataset.acao) {
    case 'subir': [lista[i - 1], lista[i]] = [lista[i], lista[i - 1]]; break;
    case 'descer': [lista[i + 1], lista[i]] = [lista[i], lista[i + 1]]; break;
    case 'editar': abrirForm(i); return;
    case 'excluir':
      if (!confirm(`Excluir "${lista[i].nome}"?`)) return;
      { const [rem] = lista.splice(i, 1); soltarFoto(rem.foto); }
      break;
  }
  render();
});

/* ---------- Formulário ---------- */
$('#adicionar').addEventListener('click', () => abrirForm(null));
$('#cancelar').addEventListener('click', () => $('#dlg').close());

function abrirForm(i) {
  const t = TIPOS[S.aba], item = i === null ? {} : S.dados[S.aba][i];
  S.editando = i; S.fotoForm = null;
  $('#dlg-titulo').textContent = (i === null ? 'Adicionar ' : 'Editar ') + t.singular;
  $('#form-erro').textContent = '';
  $('#foto-input').value = '';
  mostrarPrevia(item.foto ? urlFoto(item.foto) : null);
  $('#campos').innerHTML = t.campos.map(c => {
    const v = item[c.k] ?? c.padrao ?? '';
    const ctrl = c.ops
      ? `<select name="${c.k}">${c.ops.map(([val, txt]) => `<option value="${val}" ${val === v ? 'selected' : ''}>${txt}</option>`).join('')}</select>`
      : `<input name="${c.k}" value="${esc(v)}" placeholder="${esc(c.ph || '')}" ${c.req ? 'required' : ''}>`;
    return `<label class="${c.largo ? 'largo' : ''}">${c.l}${ctrl}</label>`;
  }).join('');
  $('#dlg').showModal();
}

function mostrarPrevia(url) {
  $('#foto-prev').innerHTML = url ? `<img src="${esc(url)}" alt="">` : '<span>Sem foto</span>';
}

/* Reduz e converte a foto para WebP antes de enviar. */
async function comprimir(arquivo, maxLado) {
  const img = await createImageBitmap(arquivo);
  const k = Math.min(1, maxLado / Math.max(img.width, img.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  img.close?.();
  let blob = await new Promise(r => cv.toBlob(r, 'image/webp', 0.82));
  let ext = 'webp';
  if (!blob || blob.type !== 'image/webp') { blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.85)); ext = 'jpg'; }
  return { blob, ext };
}

$('#foto-input').addEventListener('change', async e => {
  const arq = e.target.files[0]; if (!arq) return;
  $('#foto-prev').innerHTML = '<span>Processando…</span>';
  try {
    const { blob, ext } = await comprimir(arq, TIPOS[S.aba].maxLado);
    S.fotoForm = { blob, ext, url: URL.createObjectURL(blob) };
    mostrarPrevia(S.fotoForm.url);
  } catch {
    S.fotoForm = null; mostrarPrevia(null);
    $('#form-erro').textContent = 'Não foi possível ler essa imagem. Tente uma foto JPG ou PNG.';
  }
});

$('#form-item').addEventListener('submit', async e => {
  e.preventDefault();
  const t = TIPOS[S.aba], lista = S.dados[S.aba];
  const antigo = S.editando === null ? {} : lista[S.editando];
  const novo = { ...antigo };
  for (const c of t.campos) novo[c.k] = e.target.elements[c.k].value.trim();
  if (!S.fotoForm && !antigo.foto) { $('#form-erro').textContent = 'Escolha uma foto.'; return; }

  if (S.fotoForm) {
    const caminho = `${t.pasta}/${slug(novo.nome)}-${Date.now().toString(36)}.${S.fotoForm.ext}`;
    const base64 = bytesParaB64(new Uint8Array(await S.fotoForm.blob.arrayBuffer()));
    S.fotosNovas.set(caminho, { base64, url: S.fotoForm.url });
    novo.foto = caminho;
  }
  if (S.editando === null) lista.push(novo); else lista[S.editando] = novo;
  if (S.fotoForm && antigo.foto) soltarFoto(antigo.foto);
  S.fotoForm = null;
  $('#dlg').close();
  render();
  toast('Salvo na tela. Clique em “Publicar no site” para enviar.', 'ok');
});

/* ---------- Início: retoma a sessão da aba ---------- */
(async () => {
  let sessao = null;
  try { sessao = JSON.parse(sessionStorage.getItem('ivan-admin')); } catch {}
  if (!sessao) return;
  S.token = sessao.token; S.usuario = sessao.usuario;
  try { await carregarDados(); abrirPainel(); }
  catch { S.token = null; try { sessionStorage.removeItem('ivan-admin'); } catch {} }
})();
