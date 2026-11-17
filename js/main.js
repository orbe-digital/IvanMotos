/* =========================================================
   CONFIGURAÇÃO DA LOJA — troque os dados abaixo
   ========================================================= */
const LOJA = {
  whatsapp: "5583900000000",            // DDI + DDD + número, só dígitos
  telefoneExibicao: "(83) 9 0000-0000",
  instagram: "https://instagram.com/",  // perfil da loja
  googleAvaliacao: "https://www.google.com/search?q=Ivan+Motos", // trocar pelo link "Pedir avaliações" do Perfil da Empresa no Google
  endereco: "Endereço da loja — Cidade/PB",
  mapsLink: "https://www.google.com/maps/search/?api=1&query=Ivan+Motos",
  mapsEmbed: "",  // ao hospedar: cole aqui o link src do "Incorporar um mapa" do Google Maps
  horarios: [["Seg a Sex","08h às 18h"],["Sábado","08h às 12h"]]
};

/* CATÁLOGO e CLIENTES ficam em data/motos.json e data/clientes.json,
   editados pelo painel Pages CMS (configuração em .pages.yml). */
let MOTOS = [], CLIENTES = [];

/* ========================================================= */
const $ = (s,c=document)=>c.querySelector(s), $$=(s,c=document)=>[...c.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const wa = msg => `https://wa.me/${LOJA.whatsapp}?text=${encodeURIComponent(msg||"Olá, Ivan Motos!")}`;
function bindLinks(root=document){
  $$('.js-wa',root).forEach(a=>{a.href=wa(a.dataset.msg);a.target="_blank";a.rel="noopener"});
}
bindLinks();
$$('.js-google').forEach(a=>a.href=LOJA.googleAvaliacao);
$$('.js-insta').forEach(a=>a.href=LOJA.instagram);
$$('.js-maps').forEach(a=>a.href=LOJA.mapsLink);
$('#addr').textContent=LOJA.endereco; $('#addr2').textContent=LOJA.endereco; $('#faddr').textContent=LOJA.endereco;
$('#phone').textContent=LOJA.telefoneExibicao; $('#fphone').textContent=LOJA.telefoneExibicao;
$('#hours').innerHTML=LOJA.horarios.map(([d,h])=>`<dt>${d}</dt><dd>${h}</dd>`).join('');
$('#yr').textContent=new Date().getFullYear();
if(LOJA.mapsEmbed){const f=document.createElement('iframe');f.src=LOJA.mapsEmbed;f.loading="lazy";f.title="Mapa Ivan Motos";$('#map').prepend(f);$('.map-art').remove();$('.pin').remove();}

/* Catálogo */
const ic = {
  cal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  km:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="13" r="8"/><path d="M12 13l4-4M12 3v2"/></svg>',
  gear:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.2 4.2l2.9 2.9M16.9 16.9l2.9 2.9M1 12h4M19 12h4M4.2 19.8l2.9-2.9M16.9 7.1l2.9-2.9"/></svg>'
};
function renderGrid(f="todas"){
  const g=$('#grid');
  g.innerHTML=MOTOS.filter(m=>f==="todas"||m.tipo===f).map((m,i)=>`
    <article class="moto reveal ${['','d1','d2','d3'][i%4]}">
      <div class="moto-img"><img src="${esc(m.foto)}" alt="${esc(m.nome)}" loading="lazy"><span class="tag ${m.tipo==="nova"?"nova":"usada"}">${m.tipo==="nova"?"Nova":"Usada"}</span></div>
      <div class="moto-body">
        <h3>${esc(m.nome)}</h3>
        <div class="specs"><span>${ic.cal}${esc(m.ano)}</span><span>${ic.km}${esc(m.km)}</span><span>${ic.gear}${esc(m.cambio)}</span></div>
        <div class="price">${esc(m.preco)}<small>${esc(m.obs)}</small></div>
        <a class="btn btn-primary js-wa" href="#" data-msg="Olá, Ivan Motos! Tenho interesse na ${esc(m.nome)} (${m.tipo==="nova"?"nova":"usada"}, ${esc(m.ano)}). Pode me passar valores e condições?">
          <svg viewBox="0 0 24 24" fill="currentColor"><use href="#i-wa"/></svg>Quero essa</a>
      </div>
    </article>`).join('') || '<p style="color:var(--muted)">Nenhuma moto nessa categoria no momento. Chama no WhatsApp que a gente te ajuda!</p>';
  bindLinks(g); observe($$('.reveal',g));
}
$$('.filters button').forEach(b=>b.addEventListener('click',()=>{
  $$('.filters button').forEach(x=>x.classList.toggle('on',x===b)); renderGrid(b.dataset.f);
}));

/* Clientes (carrossel infinito) */
const camIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
const shot=c=>`<figure class="shot">${c.foto?`<img src="${esc(c.foto)}" alt="${esc(c.nome)} — ${esc(c.moto)}" loading="lazy">`:`<div class="ph">${camIcon}<span>Foto do cliente</span></div>`}<figcaption>${esc(c.nome)}<small>${esc(c.moto)}</small></figcaption></figure>`;
function renderClientes(){
  // Sem fotos cadastradas: mostra os espaços reservados
  let lista = CLIENTES.length ? CLIENTES : Array(8).fill({foto:"", nome:"Cliente Ivan Motos", moto:"Entrega de moto nova"});
  // Repete as fotos até ter o suficiente para o carrossel não ficar com buracos
  while(lista.length<8) lista=lista.concat(lista);
  const half=Math.ceil(lista.length/2);
  $('#rail1').innerHTML=lista.slice(0,half).map(shot).join('').repeat(2);
  $('#rail2').innerHTML=lista.slice(half).map(shot).join('').repeat(2);
}

/* Reveal ao rolar */
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.12,rootMargin:"0px 0px -40px 0px"});
function observe(els){els.forEach(el=>io.observe(el))}
observe($$('.reveal'));
renderClientes();

/* Carrega catálogo e clientes dos arquivos JSON */
const carregar=(url,chave)=>fetch(url,{cache:'no-cache'}).then(r=>r.ok?r.json():{}).then(d=>Array.isArray(d[chave])?d[chave]:[]).catch(()=>[]);
Promise.all([carregar('data/motos.json','motos'),carregar('data/clientes.json','clientes')]).then(([m,c])=>{
  MOTOS=m; CLIENTES=c.filter(x=>x&&x.foto);
  renderGrid(); renderClientes();
});

/* Parallax */
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
const pxEls=$$('[data-speed]'), xEls=$$('[data-x]');
let ticking=false;
function parallax(){
  const vh=innerHeight;
  pxEls.forEach(el=>{
    const host=el.parentElement.getBoundingClientRect();
    if(host.bottom<-200||host.top>vh+200) return;
    const center=host.top+host.height/2-vh/2;
    el.style.transform=`translate3d(0,${(-center*parseFloat(el.dataset.speed)).toFixed(1)}px,0)`;
  });
  xEls.forEach(el=>{
    const r=el.parentElement.getBoundingClientRect();
    el.style.transform=`translate3d(${(r.top*parseFloat(el.dataset.x)-100).toFixed(1)}px,0,0)`;
  });
  ticking=false;
}
if(!reduce){addEventListener('scroll',()=>{if(!ticking){requestAnimationFrame(parallax);ticking=true}},{passive:true});addEventListener('resize',parallax);parallax();}

/* Header + menu ativo */
const header=$('.header');
const onScroll=()=>header.classList.toggle('scrolled',scrollY>40);
addEventListener('scroll',onScroll,{passive:true});onScroll();
$('#burger').addEventListener('click',()=>{const o=header.classList.toggle('open');$('#burger').setAttribute('aria-expanded',o)});
$$('.menu a').forEach(a=>a.addEventListener('click',()=>header.classList.remove('open')));
const secs=$$('main section[id]');
const so=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){$$('.menu a').forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#'+e.target.id))}}),{rootMargin:"-45% 0px -50% 0px"});
secs.forEach(s=>so.observe(s));
