import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const authId = '\0lobby-qa-auth';
const entryId = '\0lobby-qa-entry';
const requestCounts = new Map();
const fixtures = new Map();
const definitions = [
  ['Billiards', 'Shared Room', 150], ['Billiards', 'Solo Regular', 200],
  ['Billiards', 'Solo Big Room', 250], ['Billiards', 'VIP', 400],
  ['KTV', 'Standard Room', 300], ['Court', 'Standard', 350], ['Court', 'Official Games', 500],
];

function fixture(name) {
  const counts = name === 'empty' ? [] : name === 'dense60' ? [24, 10, 6, 4, 10, 4, 2] : name === 'dense35' ? [12, 6, 4, 3, 6, 2, 2]
    : name === 'sparse' ? [1, 0, 0, 0, 1, 0, 1] : [4, 3, 3, 2, 5, 2, 2];
  const rooms = [];
  const sessions = [];
  const catalog = new Map();
  const now = Date.now();
  counts.forEach((count, category) => {
    if (!count) return;
    let [facilityName, roomName, price] = definitions[category];
    if (name === 'long-label' && category === 6) {
      facilityName = 'Private Celebrations and Function Rooms';
      roomName = 'Family Celebration Room with Extended Group Seating';
    }
    if (!catalog.has(facilityName)) catalog.set(facilityName, { _id: `facility-${category}`, name: facilityName, variants: [] });
    catalog.get(facilityName).variants.push({ label: roomName, roomCount: count, status: 'Available', price });
    for (let number = 1; number <= count; number += 1) {
      const index = rooms.length;
      const state = index % 6;
      const _id = `fixture-${category}-${number}`;
      rooms.push({ _id, facilityName, roomName, roomNumber: String(number), price, status: state === 5 ? 'Under Maintenance' : state === 0 ? 'Available' : 'Occupied', isTemporary: false });
      if (state > 0 && state < 5) {
        const remaining = { 1: 95 * 60000, 2: 7 * 60000, 3: 50 * 1000, 4: -5 * 60000 }[state];
        sessions.push({ _id: `session-${_id}`, room: _id, roomNumber: String(number), facilityName, roomName, status: 'Active', startTime: new Date(now - 3600000).toISOString(), scheduledEndTime: new Date(now + remaining).toISOString(), duration: 2, rate: price, amount: price * 2, paidAmount: state === 2 ? 0 : price * 2, paymentStatus: state === 2 ? 'Unpaid' : 'Paid', guestName: 'Fixture guest' });
      }
    }
  });
  return { rooms, sessions, catalog: [...catalog.values()] };
}

function settings(url) {
  return {
    width: Math.max(1, Math.min(3840, Number(url.searchParams.get('w')) || 1920)),
    height: Math.max(1, Math.min(2160, Number(url.searchParams.get('h')) || 1080)),
    scenario: url.searchParams.get('case') || 'sample21',
    native: url.searchParams.get('native') === '1',
    live: url.searchParams.get('live') === '1',
  };
}

function previewHtml(url) {
  const { width, height, scenario, native } = settings(url);
  const safeScenario = ['sample21', 'dense35', 'dense60', 'sparse', 'empty', 'failedAPI', 'long-label'].includes(scenario) ? scenario : 'sample21';
  const query = new URLSearchParams({ w: String(width), h: String(height), case: safeScenario, native: native ? '1' : '0' });
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lobby TV — isolated visual QA</title><style>
  body{margin:0;background:#17202a;color:#e7edf4;font:14px Arial,sans-serif}header{padding:12px 16px;display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center}nav{display:flex;flex-wrap:wrap;gap:8px}a{color:#7ce3cd;text-decoration:underline}#qa{display:block;margin:0 16px 12px;padding:8px 12px;background:#0c121a;border:1px solid #44515e;white-space:pre-wrap;font:12px/1.5 monospace}#frame-wrap{margin:0 auto;position:relative;overflow:hidden}iframe{border:0;display:block;transform-origin:top left;background:#101d33}
  </style></head><body><header><strong>ISOLATED FIXTURE QA · ${safeScenario} · ${width}×${height}</strong><nav>
  ${[[1920,1080],[1280,720],[390,844],[320,700]].map(([w,h]) => `<a href="/tv-preview?w=${w}&h=${h}&case=${safeScenario}">${w}×${h}</a>`).join('')}
  </nav><nav>${['sample21','dense35','dense60','sparse','empty','failedAPI','long-label'].map((name) => `<a href="/tv-preview?w=${width}&h=${height}&case=${name}">${name}</a>`).join('')}</nav><a href="/tv-stage?${query}&native=1" target="_blank">Direct stage / native fullscreen</a></header>
  <output id="qa">Loading fixture. Use the actual Display on TV button inside the preview.</output><div id="frame-wrap"><iframe id="stage" title="Lobby monitor fixture" src="/tv-stage?${query}" width="${width}" height="${height}" allow="fullscreen" allowfullscreen></iframe></div>
  <script>const frame=document.getElementById('stage'),wrap=document.getElementById('frame-wrap');function scale(){const factor=Math.min(1,(innerWidth-24)/${width});frame.style.transform='scale('+factor+')';wrap.style.width=(${width}*factor)+'px';wrap.style.height=(${height}*factor)+'px';}addEventListener('resize',scale);scale();addEventListener('message',event=>{if(event.origin===location.origin&&event.source===frame.contentWindow&&event.data?.type==='lobby-qa'){document.getElementById('qa').textContent=event.data.text;}});</script></body></html>`;
}

function stageHtml(url) {
  const { width, height, native, live } = settings(url);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lobby monitor fixture stage</title><style>html,body{margin:0;padding:0;overflow:hidden}#root>.lobby-display{width:${width}px!important;height:${height}px!important;min-height:${height}px!important}html:fullscreen #root>.lobby-display{width:100vw!important;height:100vh!important;min-height:100vh!important}#direct-qa{position:fixed;bottom:0;right:0;z-index:99999;background:#fff;color:#000;font:11px monospace;max-width:75vw;padding:6px;pointer-events:none;white-space:pre-wrap}</style></head><body><div id="root"></div><script>
  localStorage.setItem('lobbyMonitor.overdueSoundMuted','1');localStorage.setItem('lobbyMonitor.viewMode','grid');
  ${native ? '' : "document.documentElement.requestFullscreen=()=>Promise.reject(new Error('Fixture fullscreen fallback'));"}
  </script><script type="module" src="/qa-entry.js"></script>${live ? '<script>let tries=0;const handle=setInterval(()=>{const button=document.querySelector(".lobby-golive-btn");if(button){button.click();clearInterval(handle);}else if(++tries>200){clearInterval(handle);}},25);</script>' : ''}</body></html>`;
}

const entryCode = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import LobbyMonitor from '/src/pages/Admin/LobbyMonitor.jsx';
import '/src/styles/root.css';
import '/src/styles/design-system.css';
createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,React.createElement(LobbyMonitor)));
const describe=element=>(element.className||element.tagName)+' '+(element.textContent||'').trim().slice(0,45);
const outside=(rect,bounds)=>rect.left<bounds.left-1||rect.top<bounds.top-1||rect.right>bounds.right+1||rect.bottom>bounds.bottom+1;
function diagnostics(){
 const display=document.querySelector('.lobby-display');if(!display)return;
 const live=display.classList.contains('lobby-display--live');
 const board=document.querySelector('.lobby-tv-board');
 const scroll=document.querySelector('.lobby-scroll');
 const cards=[...document.querySelectorAll(live?'.lobby-tv-room':'.lobby-card')];
 const headers=[...document.querySelectorAll('.lobby-tv-category-title')];
 const descendants=[...document.querySelectorAll('.lobby-tv-room *,.lobby-tv-category-title')].filter(el=>el.textContent.trim());
 const tol=el=>{const own=parseFloat(getComputedStyle(el).fontSize)||12;const quick=Math.max(3,own*0.35);if(!(el.scrollWidth>el.clientWidth+quick||el.scrollHeight>el.clientHeight+quick))return false;let max=own;for(const k of el.querySelectorAll('*')){const s=parseFloat(getComputedStyle(k).fontSize)||0;if(s>max)max=s;}const sized=Math.max(3,max*0.35);return el.scrollWidth>el.clientWidth+sized||el.scrollHeight>el.clientHeight+sized;};
 const overflowing=descendants.filter(el=>el.clientWidth>0&&tol(el));
 const clipped=[...document.querySelectorAll('.lobby-tv-room > *,.lobby-tv-room > * > *')].filter(el=>{const tile=el.closest('.lobby-tv-room');if(!tile)return false;const r=el.getBoundingClientRect(),t=tile.getBoundingClientRect();return r.width>0&&(r.left<t.left-1||r.top<t.top-1||r.right>t.right+1||r.bottom>t.bottom+1);});
 const bound=board?.getBoundingClientRect();
 const offBoard=bound?cards.filter(el=>outside(el.getBoundingClientRect(),bound)):[];
 const issues=[];
 if(overflowing.length)issues.push('Text/header overflow: '+overflowing.slice(0,8).map(describe).join(' | '));
 if(clipped.length)issues.push('Clipped inside tile: '+clipped.slice(0,8).map(describe).join(' | '));
 if(offBoard.length)issues.push('Cards outside board: '+offBoard.length);
 if(board&&innerWidth>640&&outside(board.getBoundingClientRect(),scroll.getBoundingClientRect()))issues.push('Board exceeds scroll bounds');
 const rect=display.getBoundingClientRect(), viewport={left:0,top:0,right:innerWidth,bottom:innerHeight};
 if(outside(rect,viewport))issues.push('Display exceeds stage viewport');
 const timer=document.querySelector('.lobby-tv-value--timer');
 const text=[(live?'TV':'SETUP')+' · '+cards.length+' cards · '+headers.length+' categories · display '+Math.round(rect.width)+'×'+Math.round(rect.height)+(bound?' · board '+Math.round(bound.width)+'×'+Math.round(bound.height):'')+(timer?' · timer font '+getComputedStyle(timer).fontSize:''),issues.length?issues.join('\\n'):(live?'PASS: all visible card bounds and text fit.':'Preview mode; click Display on TV for board checks.')].join('\\n');
 window.parent.postMessage({type:'lobby-qa',text},location.origin);
 if(window.parent===window){let output=document.getElementById('direct-qa');if(!output){output=document.createElement('output');output.id='direct-qa';output.hidden=new URLSearchParams(location.search).has('clean');document.body.append(output);}output.textContent=text;}
}
setInterval(diagnostics,500);
`;

const server = await createServer({
  root,
  configFile: false,
  envDir: false,
  define: { 'import.meta.env.VITE_API_URL': '""' },
  plugins: [{
    name: 'isolated-lobby-qa',
    enforce: 'pre',
    resolveId(source) {
      if (/\bcontext\/AuthContext(?:\.jsx)?$/.test(source)) return authId;
      if (source === '/qa-entry.js') return entryId;
    },
    load(id) {
      if (id === authId) return 'export const useAuth = () => ({ initializing: false, isAdmin: true });';
      if (id === entryId) return entryCode;
    },
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://127.0.0.1:5502');
        if (url.pathname.startsWith('/api/')) {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          if (req.method !== 'GET') { res.statusCode = 405; res.end(JSON.stringify({ message: 'Fixture server is read-only.' })); return; }
          const referrer = new URL(req.headers.referer || '/tv-stage', 'http://127.0.0.1:5502');
          const scenario = settings(referrer).scenario;
          const requestKey = referrer.search + url.pathname;
          const count = (requestCounts.get(requestKey) || 0) + 1;
          requestCounts.set(requestKey, count);
          if (scenario === 'failedAPI' && count > 1) { res.statusCode = 503; res.end(JSON.stringify({ message: 'Simulated fixture connection interruption.' })); return; }
          if (!fixtures.has(scenario)) fixtures.set(scenario, fixture(scenario));
          const data = fixtures.get(scenario);
          const response = { '/api/monitor-rooms': data.rooms, '/api/room-sessions': data.sessions, '/api/rooms': data.catalog }[url.pathname];
          if (!response) { res.statusCode = 404; res.end(JSON.stringify({ message: 'No such fixture endpoint.' })); return; }
          res.end(JSON.stringify(response));return;
        }
        if (url.pathname === '/tv-preview' || url.pathname === '/tv-stage') {
          const html = url.pathname === '/tv-preview' ? previewHtml(url) : stageHtml(url);
          res.setHeader('Content-Type', 'text/html');
          res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:5502; img-src 'self' data:; font-src 'self' data:");
          res.end(await vite.transformIndexHtml(url.pathname, html));return;
        }
        next();
      });
    },
  }, react()],
  server: { host: '127.0.0.1', port: 5502, strictPort: true },
});
await server.listen();
console.log('Isolated lobby visual QA: http://127.0.0.1:5502/tv-preview?w=1920&h=1080&case=sample21');
