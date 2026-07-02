import crypto from 'node:crypto';
import { config } from '../config.js';
import { listLeads, getLead, updateEstado, stats, exportCsv, proyectosStats } from '../crm/db.js';
import { refrescarCatalogo } from '../scraper/catalogo-cache.js';

const VERDE = '#1A963A';
const LIMA = '#8DC703';

// ---- Sesión (cookie firmada) ----
function sign(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', config.adminSecret).update(data).digest('base64url');
  return `${data}.${mac}`;
}
function verify(token) {
  if (!token) return null;
  const [data, mac] = token.split('.');
  if (!data || !mac) return null;
  const exp = crypto.createHmac('sha256', config.adminSecret).update(data).digest('base64url');
  if (mac !== exp) return null;
  try {
    const p = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (p.exp && Date.now() > p.exp) return null;
    return p;
  } catch {
    return null;
  }
}
function cookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((c) => {
    const i = c.indexOf('=');
    if (i > 0) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  });
  return out;
}
function isAuthed(req) {
  return !!verify(cookies(req).crm_session);
}
function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => resolve(b));
  });
}
function json(res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
}

/** Maneja rutas /admin*. Devuelve true si atendió la request. */
export async function handleAdmin(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  if (!p.startsWith('/admin')) return false;

  // Login
  if (p === '/admin/login' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(loginHtml());
    return true;
  }
  if (p === '/admin/login' && req.method === 'POST') {
    const body = new URLSearchParams(await readBody(req));
    const u = body.get('user');
    const pw = body.get('pass');
    if (u === config.adminUser && pw === config.adminPass) {
      const token = sign({ u, exp: Date.now() + 86400000 });
      res.writeHead(302, {
        'set-cookie': `crm_session=${token}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax`,
        location: '/admin',
      });
      res.end();
    } else {
      res.writeHead(302, { location: '/admin/login?e=1' });
      res.end();
    }
    return true;
  }
  if (p === '/admin/logout') {
    res.writeHead(302, { 'set-cookie': 'crm_session=; Path=/; Max-Age=0', location: '/admin/login' });
    res.end();
    return true;
  }

  // A partir de acá, requiere sesión
  if (!isAuthed(req)) {
    if (p.startsWith('/admin/api')) return json(res, 401, { error: 'no auth' }), true;
    res.writeHead(302, { location: '/admin/login' });
    res.end();
    return true;
  }

  if (p === '/admin' || p === '/admin/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(dashboardHtml());
    return true;
  }
  if (p === '/admin/api/stats') return json(res, 200, { ...stats(), catalogo: proyectosStats() }), true;
  if (p === '/admin/api/refrescar' && req.method === 'POST') {
    refrescarCatalogo().catch(() => {});
    return json(res, 200, { ok: true, mensaje: 'Refresco iniciado en segundo plano' }), true;
  }
  if (p === '/admin/api/leads') {
    return json(res, 200, listLeads({
      q: url.searchParams.get('q') || '',
      estado: url.searchParams.get('estado') || '',
      score: url.searchParams.get('score') || '',
    })), true;
  }
  if (p === '/admin/api/lead') {
    const lead = getLead(Number(url.searchParams.get('id')));
    return json(res, lead ? 200 : 404, lead || { error: 'no existe' }), true;
  }
  if (p === '/admin/api/estado' && req.method === 'POST') {
    const b = JSON.parse(await readBody(req) || '{}');
    updateEstado(Number(b.id), String(b.estado));
    return json(res, 200, { ok: true }), true;
  }
  if (p === '/admin/export.csv') {
    res.writeHead(200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="leads-aconcagua.csv"',
    });
    res.end(exportCsv());
    return true;
  }

  res.writeHead(404);
  res.end('not found');
  return true;
}

// ---------- HTML ----------
const HEAD = `
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Open+Sans+Condensed:ital,wght@0,300;0,700;1,300&family=Open+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  :root{--verde:${VERDE};--lima:${LIMA};--gris:#414141}
  *{box-sizing:border-box}
  body{margin:0;font-family:'Open Sans',system-ui,Arial,sans-serif;color:var(--gris);background:#f3f6ef}
  a{color:var(--verde);text-decoration:none}
  .cond{font-family:'Open Sans Condensed',sans-serif}
</style>`;

function loginHtml() {
  return `<!doctype html><html lang="es"><head>${HEAD}<title>CRM · Inmobiliaria Aconcagua</title></head>
<body style="display:flex;min-height:100vh;align-items:center;justify-content:center">
  <form method="post" action="/admin/login" style="background:#fff;border:1px solid #e6ece0;border-radius:16px;padding:36px 34px;width:340px;box-shadow:0 10px 40px rgba(26,150,58,.08)">
    <div style="text-align:center;margin-bottom:8px"><img src="/logo.png" alt="Aconcagua" style="height:34px"></div>
    <div style="height:5px;border-radius:4px;background:linear-gradient(90deg,var(--verde),var(--lima));margin:14px 0 22px"></div>
    <h1 class="cond" style="font-size:22px;color:var(--verde);margin:0 0 4px;text-transform:uppercase;letter-spacing:.5px">Panel Comercial</h1>
    <p style="margin:0 0 20px;color:#8e8e8e;font-size:14px">Ingresa para ver los leads en vivo</p>
    <label style="font-size:13px;color:#8e8e8e">Usuario</label>
    <input name="user" autofocus style="width:100%;padding:11px 12px;margin:6px 0 14px;border:1px solid #dfe6d8;border-radius:9px;font-size:15px">
    <label style="font-size:13px;color:#8e8e8e">Contraseña</label>
    <input name="pass" type="password" style="width:100%;padding:11px 12px;margin:6px 0 20px;border:1px solid #dfe6d8;border-radius:9px;font-size:15px">
    <button style="width:100%;padding:12px;border:0;border-radius:9px;background:var(--verde);color:#fff;font-size:16px;font-weight:700;cursor:pointer">Entrar</button>
    <p id="err" style="color:#c0392b;font-size:13px;text-align:center;margin:14px 0 0;display:none">Usuario o contraseña incorrectos</p>
  </form>
  <script>if(location.search.includes('e=1'))document.getElementById('err').style.display='block'</script>
</body></html>`;
}

function dashboardHtml() {
  return `<!doctype html><html lang="es"><head>${HEAD}<title>CRM · Leads · Aconcagua</title>
<style>
  .top{background:#fff;border-bottom:1px solid #e6ece0;padding:12px 22px;display:flex;align-items:center;justify-content:space-between}
  .wrap{max-width:1200px;margin:0 auto;padding:22px}
  .tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:18px}
  .tile{background:#fff;border:1px solid #e6ece0;border-radius:12px;padding:16px 18px}
  .tile .n{font-size:30px;font-weight:700;color:var(--verde);line-height:1}
  .tile .l{color:#8e8e8e;font-size:13px;text-transform:uppercase;letter-spacing:.4px;margin-top:4px}
  .bar{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap}
  input,select{padding:9px 11px;border:1px solid #dfe6d8;border-radius:9px;font-size:14px;font-family:inherit}
  .btn{background:var(--verde);color:#fff;border:0;border-radius:9px;padding:9px 14px;font-weight:700;cursor:pointer;font-size:14px}
  .btn.g{background:#fff;color:var(--verde);border:1px solid var(--verde)}
  table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e6ece0;border-radius:12px;overflow:hidden}
  th{background:#f6f9f1;text-align:left;padding:11px 12px;font-size:12px;color:#6b7c5a;text-transform:uppercase;letter-spacing:.4px}
  td{padding:11px 12px;border-top:1px solid #eef3ea;font-size:14px}
  tr:hover td{background:#fafcf7;cursor:pointer}
  .badge{display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:700}
  .caliente{background:#ffe2df;color:#c0392b}.tibio{background:#fff3d6;color:#a9791a}.frio{background:#e6eef8;color:#3a6ea5}
  .est{font-size:12px;padding:2px 8px;border-radius:6px;background:#eef3ea;color:#5c6b4f}
  .modal{position:fixed;inset:0;background:rgba(0,0,0,.4);display:none;align-items:center;justify-content:center;padding:20px}
  .card{background:#fff;border-radius:14px;max-width:560px;width:100%;max-height:88vh;overflow:auto;padding:24px}
  .msg{padding:8px 12px;border-radius:10px;margin:6px 0;font-size:14px;max-width:85%}
  .msg.user{background:#eef3ea;margin-right:auto}
  .msg.agent{background:#f2f8e8;margin-left:auto;text-align:right}
  @media(max-width:700px){.tiles{grid-template-columns:repeat(2,1fr)}}
</style></head>
<body>
  <div class="top">
    <div style="display:flex;align-items:center;gap:12px"><img src="/logo.png" style="height:26px"><b class="cond" style="color:var(--verde);text-transform:uppercase;letter-spacing:.5px">CRM · Panel Comercial</b></div>
    <div><a href="/admin/export.csv" class="btn g" style="margin-right:8px">⬇ CSV</a><a href="/admin/logout" style="color:#8e8e8e;font-size:14px">Salir</a></div>
  </div>
  <div class="wrap">
    <div class="tiles" id="tiles"></div>
    <div class="bar">
      <input id="q" placeholder="Buscar nombre, teléfono, email, proyecto…" style="flex:1;min-width:200px">
      <select id="score"><option value="">Todos los scores</option><option value="caliente">🔥 Caliente</option><option value="tibio">Tibio</option><option value="frio">Frío</option></select>
      <select id="estado"><option value="">Todos los estados</option><option>nuevo</option><option>contactado</option><option>agendado</option><option>cerrado</option></select>
      <button class="btn" onclick="load()">Filtrar</button>
    </div>
    <table><thead><tr><th>Cliente</th><th>Contacto</th><th>Interés</th><th>Presup.</th><th>Score</th><th>Estado</th><th>Actualizado</th></tr></thead><tbody id="rows"></tbody></table>
  </div>

  <div class="modal" id="modal" onclick="if(event.target.id==='modal')close_()">
    <div class="card" id="card"></div>
  </div>

<script>
const $=(s)=>document.querySelector(s);
async function stats(){const s=await (await fetch('/admin/api/stats')).json();
  $('#tiles').innerHTML=[['Total leads',s.total],['🔥 Calientes',s.calientes],['Nuevos',s.nuevos],['Con cotización',s.conCotizacion]]
   .map(([l,n])=>'<div class="tile"><div class="n">'+n+'</div><div class="l">'+l+'</div></div>').join('');}
function fecha(s){return (s||'').slice(0,16).replace('T',' ');}
async function load(){
  const q=$('#q').value,score=$('#score').value,estado=$('#estado').value;
  const r=await (await fetch('/admin/api/leads?q='+encodeURIComponent(q)+'&score='+score+'&estado='+estado)).json();
  $('#rows').innerHTML=r.map(l=>'<tr onclick="ver('+l.id+')">'
    +'<td><b>'+(l.nombre||'—')+'</b><br><span style=color:#8e8e8e;font-size:12px>'+(l.rut||'')+'</span></td>'
    +'<td>'+(l.telefono||'—')+'<br><span style=color:#8e8e8e;font-size:12px>'+(l.email||'')+'</span></td>'
    +'<td>'+(l.proyecto_interes||l.comuna||'—')+'</td>'
    +'<td>'+(l.presupuesto_uf?('UF '+l.presupuesto_uf):'—')+'</td>'
    +'<td><span class="badge '+(l.score||'tibio')+'">'+(l.score||'tibio')+'</span></td>'
    +'<td><span class="est">'+(l.estado||'nuevo')+'</span></td>'
    +'<td style=color:#8e8e8e;font-size:13px>'+fecha(l.updated_at)+'</td></tr>').join('')
    || '<tr><td colspan=7 style="text-align:center;color:#8e8e8e;padding:30px">Sin leads aún</td></tr>';
}
async function ver(id){
  const l=await (await fetch('/admin/api/lead?id='+id)).json();
  const info=[['Nombre',l.nombre],['RUT',l.rut],['Teléfono',l.telefono],['Email',l.email],['Proyecto',l.proyecto_interes],['Comuna',l.comuna],['Presupuesto',l.presupuesto_uf?('UF '+l.presupuesto_uf):''],['Dormitorios',l.dormitorios],['Cotizaciones',l.cotizaciones]]
    .filter(x=>x[1]).map(x=>'<tr><td style=color:#8e8e8e;padding:3px 12px 3px 0>'+x[0]+'</td><td><b>'+x[1]+'</b></td></tr>').join('');
  const msgs=(l.mensajes||[]).map(m=>'<div class="msg '+m.rol+'">'+(m.texto||'').replace(/</g,'&lt;')+'</div>').join('')||'<p style=color:#8e8e8e>Sin mensajes</p>';
  const opts=['nuevo','contactado','agendado','cerrado'].map(e=>'<option '+(e===l.estado?'selected':'')+'>'+e+'</option>').join('');
  $('#card').innerHTML='<div style="display:flex;justify-content:space-between;align-items:center"><h2 class="cond" style="color:var(--verde);margin:0;text-transform:uppercase">Lead #'+l.id+' <span class="badge '+(l.score||'tibio')+'">'+(l.score||'tibio')+'</span></h2><span onclick="close_()" style="cursor:pointer;font-size:22px;color:#8e8e8e">×</span></div>'
    +'<table style="margin:14px 0">'+info+'</table>'
    +'<div style="margin:10px 0"><b>Estado:</b> <select id="est'+l.id+'" onchange="setEstado('+l.id+',this.value)">'+opts+'</select></div>'
    +'<h3 class="cond" style="color:var(--verde);text-transform:uppercase;font-size:15px;margin:16px 0 6px">Conversación</h3>'
    +'<div style="display:flex;flex-direction:column;gap:2px">'+msgs+'</div>';
  $('#modal').style.display='flex';
}
async function setEstado(id,estado){await fetch('/admin/api/estado',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,estado})});load();}
function close_(){$('#modal').style.display='none'}
$('#q').addEventListener('keydown',e=>{if(e.key==='Enter')load()});
stats();load();
setInterval(()=>{stats();load()},20000);
</script>
</body></html>`;
}
