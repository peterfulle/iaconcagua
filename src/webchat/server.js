import { responder } from '../agent.js';

const VERDE = '#1A963A';
const LIMA = '#8DC703';

function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => resolve(b));
  });
}

/** Maneja /chat y /chat/api. Devuelve true si atendió la request. */
export async function handleChat(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  if (p !== '/chat' && p !== '/chat/' && p !== '/chat/api') return false;

  if (p === '/chat/api' && req.method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req)) || '{}');
      const chatId = String(body.chatId || 'web-anon').slice(0, 80);
      const texto = String(body.message || '').slice(0, 2000);
      if (!texto.trim()) {
        res.writeHead(400, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: 'mensaje vacío' })), true;
      }
      const reply = await responder(`web:${chatId}`, texto, 'web');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ reply }));
    } catch (e) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return true;
  }

  // Página del chat
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(chatHtml());
  return true;
}

function chatHtml() {
  return `<!doctype html><html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Chat · Inmobiliaria Aconcagua</title>
<link href="https://fonts.googleapis.com/css2?family=Open+Sans+Condensed:wght@300;700&family=Open+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  :root{--verde:${VERDE};--lima:${LIMA}}
  *{box-sizing:border-box}
  body{margin:0;font-family:'Open Sans',system-ui,Arial,sans-serif;background:#f3f6ef;height:100vh;display:flex;flex-direction:column}
  .top{background:#fff;border-bottom:1px solid #e6ece0;padding:12px 18px;display:flex;align-items:center;gap:12px}
  .top img{height:26px}
  .top b{font-family:'Open Sans Condensed',sans-serif;color:var(--verde);text-transform:uppercase;letter-spacing:.5px}
  .bar{height:4px;background:linear-gradient(90deg,var(--verde),var(--lima))}
  #chat{flex:1;overflow-y:auto;padding:18px;max-width:680px;margin:0 auto;width:100%}
  .m{padding:10px 14px;border-radius:14px;margin:8px 0;max-width:80%;font-size:15px;line-height:1.4;white-space:pre-wrap}
  .m.user{background:var(--verde);color:#fff;margin-left:auto;border-bottom-right-radius:4px}
  .m.bot{background:#fff;border:1px solid #e6ece0;margin-right:auto;border-bottom-left-radius:4px}
  .m.typing{color:#8e8e8e;font-style:italic}
  .foot{border-top:1px solid #e6ece0;background:#fff;padding:12px;display:flex;gap:8px;max-width:680px;margin:0 auto;width:100%}
  #inp{flex:1;padding:12px 14px;border:1px solid #dfe6d8;border-radius:24px;font-size:15px;font-family:inherit;outline:none}
  #send{background:var(--verde);color:#fff;border:0;border-radius:24px;padding:0 22px;font-weight:700;cursor:pointer;font-size:15px}
  #send:disabled{opacity:.5}
</style></head>
<body>
  <div class="top"><img src="/logo.png" alt="Aconcagua"><b>Asesor Virtual</b></div>
  <div class="bar"></div>
  <div id="chat"></div>
  <div class="foot">
    <input id="inp" placeholder="Escribe tu mensaje… ej: busco depto en Ñuñoa" autofocus>
    <button id="send">Enviar</button>
  </div>
<script>
  const chat=document.getElementById('chat'), inp=document.getElementById('inp'), send=document.getElementById('send');
  let chatId=localStorage.getItem('ac_chat_id');
  if(!chatId){chatId=Date.now()+'-'+Math.random().toString(36).slice(2,8);localStorage.setItem('ac_chat_id',chatId);}
  function add(text,who){const d=document.createElement('div');d.className='m '+who;d.textContent=text;chat.appendChild(d);chat.scrollTop=chat.scrollHeight;return d;}
  add('¡Hola! 👋 Soy tu asesora de Inmobiliaria Aconcagua. ¿En qué comuna o proyecto estás buscando? Te ayudo a cotizar al instante.','bot');
  async function enviar(){
    const t=inp.value.trim(); if(!t) return;
    add(t,'user'); inp.value=''; inp.disabled=send.disabled=true;
    const typing=add('escribiendo…','bot typing');
    try{
      const r=await fetch('/chat/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chatId,message:t})});
      const j=await r.json(); typing.remove();
      add(j.reply||j.error||'…','bot');
    }catch(e){typing.remove();add('Uy, se cortó la conexión. ¿Reintentas?','bot');}
    inp.disabled=send.disabled=false; inp.focus();
  }
  send.onclick=enviar; inp.addEventListener('keydown',e=>{if(e.key==='Enter')enviar();});
</script>
</body></html>`;
}
