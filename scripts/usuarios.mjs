#!/usr/bin/env node
/* =========================================================
   Gerencia os usuários do painel /admin.

   Uso:
     node scripts/usuarios.mjs adicionar <usuario>   cria ou troca a senha
     node scripts/usuarios.mjs remover <usuario>     bloqueia o acesso
     node scripts/usuarios.mjs listar

   Para cada usuário, o token do GitHub é criptografado com a
   senha dele (PBKDF2-SHA256 + AES-GCM) e gravado em
   admin/usuarios.json. Depois, faça commit e push desse arquivo.
   ========================================================= */
import { readFileSync, writeFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';

const ARQUIVO = new URL('../admin/usuarios.json', import.meta.url);
const REPO = 'orbedigital-sites/IvanMotos';
const ITERACOES = 600000;
const SENHA_MIN = 12;

const ler = () => { try { return JSON.parse(readFileSync(ARQUIVO, 'utf8')); } catch { return { usuarios: [] }; } };
const gravar = d => writeFileSync(ARQUIVO, JSON.stringify(d, null, 2) + '\n');
const b64 = bytes => Buffer.from(bytes).toString('base64');

function perguntar(texto, oculto = false) {
  return new Promise(resolve => {
    const stdin = process.stdin;
    process.stdout.write(texto);
    if (!oculto || !stdin.isTTY) {
      stdin.resume(); stdin.setEncoding('utf8');
      stdin.once('data', d => { stdin.pause(); resolve(String(d).trim()); });
      return;
    }
    let buf = '';
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
    const aoDigitar = pedaco => {
      for (const c of pedaco) {
        if (c === '\r' || c === '\n') {
          stdin.setRawMode(false); stdin.pause(); stdin.off('data', aoDigitar);
          process.stdout.write('\n'); resolve(buf.trim()); return;
        }
        if (c === '\u0003') { process.stdout.write('\n'); process.exit(1); }
        if (c === '\u007f' || c === '\b') { buf = buf.slice(0, -1); continue; }
        buf += c;
      }
    };
    stdin.on('data', aoDigitar);
  });
}

async function cifrar(token, senha) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const base = await crypto.subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveKey']);
  const chave = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERACOES, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const cifrado = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chave, enc.encode(token));
  return { salt: b64(salt), iv: b64(iv), iter: ITERACOES, token: b64(new Uint8Array(cifrado)) };
}

async function adicionar(usuario) {
  if (!/^[a-z0-9._-]{2,32}$/.test(usuario)) throw new Error('Usuário inválido: use letras minúsculas, números, ponto, hífen ou _.');
  const senha = await perguntar(`Senha para "${usuario}" (mín. ${SENHA_MIN} caracteres): `, true);
  if (senha.length < SENHA_MIN) throw new Error(`A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`);
  if (await perguntar('Repita a senha: ', true) !== senha) throw new Error('As senhas não conferem.');
  const token = await perguntar('Token do GitHub (fine-grained, só este repositório): ', true);
  if (!token) throw new Error('Token vazio.');

  const r = await fetch(`https://api.github.com/repos/${REPO}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error(`O token não acessa ${REPO} (GitHub respondeu ${r.status}).`);

  const dados = ler();
  const reg = { usuario, ...(await cifrar(token, senha)), criado: new Date().toISOString().slice(0, 10) };
  const i = dados.usuarios.findIndex(u => u.usuario === usuario);
  if (i >= 0) dados.usuarios[i] = reg; else dados.usuarios.push(reg);
  gravar(dados);
  console.log(`✔ Usuário "${usuario}" ${i >= 0 ? 'atualizado' : 'criado'}. Faça commit e push de admin/usuarios.json.`);
}

function remover(usuario) {
  const dados = ler();
  const antes = dados.usuarios.length;
  dados.usuarios = dados.usuarios.filter(u => u.usuario !== usuario);
  if (dados.usuarios.length === antes) throw new Error(`Usuário "${usuario}" não existe.`);
  gravar(dados);
  console.log(`✔ Usuário "${usuario}" removido. Faça commit e push de admin/usuarios.json.`);
}

const [cmd, usuario] = process.argv.slice(2);
try {
  if (cmd === 'adicionar' && usuario) await adicionar(usuario.toLowerCase());
  else if (cmd === 'remover' && usuario) remover(usuario.toLowerCase());
  else if (cmd === 'listar') {
    const l = ler().usuarios;
    console.log(l.length ? l.map(u => `- ${u.usuario} (desde ${u.criado || '?'})`).join('\n') : 'Nenhum usuário cadastrado.');
  } else {
    console.log('Uso:\n  node scripts/usuarios.mjs adicionar <usuario>\n  node scripts/usuarios.mjs remover <usuario>\n  node scripts/usuarios.mjs listar');
  }
} catch (e) {
  console.error('✖ ' + e.message);
  process.exit(1);
}
