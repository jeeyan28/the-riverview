import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Local fixture only: all API requests and presentation devices are simulated.
const root = fileURLToPath(new URL('../../', import.meta.url));
const requests = {};
const startedAt = Date.now();
const rooms = [
  { _id: 'r1', facilityName: 'Billiards', roomName: 'Standard', roomNumber: 1, status: 'Occupied', price: 200 },
  { _id: 'r2', facilityName: 'Billiards', roomName: 'Standard', roomNumber: 2, status: 'Available', price: 200 },
  { _id: 'r3', facilityName: 'KTV', roomName: 'VIP', roomNumber: 1, status: 'Available', price: 400 },
  { _id: 'r4', facilityName: 'KTV', roomName: 'VIP', roomNumber: 2, status: 'Available', price: 400 },
];

function installFixture() {
  const scenario = new URLSearchParams(location.search).get('qa') || 'sender';
  const isReceiver = scenario === 'receiver';
  if (isReceiver) {
    for (const key of ['localStorage', 'sessionStorage']) {
      const values = new Map();
      Object.defineProperty(window, key, { value: { getItem: (name) => values.get(name) || null, setItem: (name, value) => values.set(name, value), removeItem: (name) => values.delete(name) } });
    }
  }
  localStorage.setItem('lobbyMonitor.overdueSoundMuted', '1');
  const channel = new BroadcastChannel('riverview-cast-browser-fixture');
  const side = isReceiver ? 'receiver' : 'sender';
  const event = (type, values) => Object.assign(new Event(type), values);
  class Connection extends EventTarget {
    constructor() {
      super();
      this.id = 'fixturepresentation001';
      this.state = 'connected';
      channel.addEventListener('message', ({ data }) => {
        if (data.side === side) return;
        if (data.action === 'terminate' || data.action === 'close') {
          this.state = data.action === 'terminate' ? 'terminated' : 'closed';
          this.dispatchEvent(event(data.action, { reason: 'wentaway' }));
        } else if (this.state === 'connected') this.dispatchEvent(event('message', { data: data.message }));
      });
    }
    send(message) { channel.postMessage({ side, message }); }
    terminate() {
      this.state = 'terminated';
      this.dispatchEvent(new Event('terminate'));
      channel.postMessage({ side, action: 'terminate' });
    }
  }
  const connection = new Connection();
  const connectionList = Object.assign(new EventTarget(), { connections: [connection] });
  Object.defineProperty(navigator, 'presentation', { configurable: true, value: isReceiver ? { receiver: { connectionList: Promise.resolve(connectionList) } } : {} });
  window.PresentationRequest = class extends EventTarget {
    constructor(url) { super(); this.url = url; }
    getAvailability() { return Promise.resolve(Object.assign(new EventTarget(), { value: scenario !== 'no-devices' })); }
    start() {
      document.querySelector('#fixture-activation').textContent = 'User activation at start(): ' + navigator.userActivation.isActive;
      if (scenario === 'cancelled') return Promise.reject(new DOMException('Fixture cancellation', 'NotAllowedError'));
      if (scenario === 'no-devices') return Promise.reject(new DOMException('Fixture no devices', 'NotFoundError'));
      return new Promise((resolve, reject) => {
        const dialog = document.createElement('dialog');
        dialog.innerHTML = '<p>Simulated Chrome device picker</p><button id="fixture-select">Fixture Chromecast</button> <button id="fixture-cancel">Cancel picker</button>';
        const cancel = () => { dialog.remove(); reject(new DOMException('Fixture cancellation', 'NotAllowedError')); };
        dialog.querySelector('#fixture-cancel').onclick = cancel;
        dialog.addEventListener('cancel', cancel);
        dialog.querySelector('#fixture-select').onclick = () => {
          dialog.remove();
          connection.state = 'connected';
          resolve(connection);
        };
        document.body.appendChild(dialog);
        dialog.showModal();
      });
    }
    reconnect() { connection.state = 'connected'; return Promise.resolve(connection); }
  };
  if (scenario === 'unsupported') window.PresentationRequest = undefined;
  if (scenario === 'insecure') Object.defineProperty(window, 'isSecureContext', { value: false });
  addEventListener('DOMContentLoaded', () => {
    const bar = document.createElement('nav');
    bar.id = 'fixture-bar';
    bar.innerHTML = '<strong>SIMULATION ONLY</strong> ' + ['sender', 'receiver', 'unsupported', 'insecure', 'cancelled', 'no-devices', 'api-failure', 'denied'].map((name) => '<a href="/lobby-monitor?qa=' + name + '">' + name + '</a>').join(' ') + ' <span id="fixture-activation">No start yet</span> <button id="fixture-disconnect">Simulate disconnect</button> <button id="fixture-update">Change fixture availability</button>';
    document.body.prepend(bar);
    bar.querySelector('#fixture-disconnect').onclick = () => {
      connection.state = 'closed';
      connection.dispatchEvent(event('close', { reason: 'wentaway' }));
      channel.postMessage({ side, action: 'close' });
    };
    bar.querySelector('#fixture-update').onclick = () => fetch('/fixture-toggle', { method: 'POST' });
  });
}

const fixture = {
  name: 'lobby-presentation-fixture',
  transformIndexHtml(html) {
    return html.replace('<head>', '<head><script>(' + installFixture.toString() + ')()</script><style>#fixture-bar{padding:8px;background:#fff;color:#111;font:13px sans-serif;display:flex;flex-wrap:wrap;gap:8px;align-items:center}#fixture-bar a{color:#0047ab}dialog{color:#111;background:white;padding:24px;border:2px solid teal}dialog button{padding:10px}.lobby-display{height:calc(100vh - 50px)!important;min-height:calc(100vh - 50px)!important}</style>');
  },
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const path = new URL(req.url, 'http://localhost').pathname;
      const scenario = new URL(req.headers.referer || 'http://localhost').searchParams.get('qa') || 'sender';
      if (path === '/fixture-metrics') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(requests));
        return;
      }
      if (path === '/fixture-toggle' && req.method === 'POST') {
        rooms[2].status = rooms[2].status === 'Available' ? 'Under Maintenance' : 'Available';
        res.end('Fixture updated');
        return;
      }
      if (!path.startsWith('/api/')) return next();
      requests[scenario] ||= {};
      requests[scenario][path] = (requests[scenario][path] || 0) + 1;
      let status = 200, body;
      if (path === '/api/auth/me') {
        status = ['receiver', 'denied'].includes(scenario) ? 401 : 200;
        body = status === 401 ? { message: 'Fixture: no login' } : { user: { _id: 'fixture-staff', firstName: 'Fixture', role: 'staff', permissions: ['room:view'] } };
      } else if (path === '/api/settings') body = {};
      else if (scenario === 'receiver') { status = 401; body = { message: 'Receiver has no API credentials' }; }
      else if (scenario === 'api-failure') { status = 503; body = { message: 'Fixture API is offline. Live data could not refresh.' }; }
      else if (path === '/api/monitor-rooms') body = rooms;
      else if (path === '/api/room-sessions') body = [{ _id: 's1', room: 'r1', status: 'Active', startTime: new Date(startedAt).toISOString(), duration: 1, amount: 200, rate: 200, paidAmount: 200, paymentStatus: 'Paid', guestName: 'Fixture guest' }];
      else if (path === '/api/rooms') body = [];
      else { status = 404; body = { message: 'Unknown fixture endpoint' }; }
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(body));
    });
  },
};

const server = await createServer({ root, configFile: false, plugins: [react(), fixture], server: { host: '127.0.0.1', port: 5502, strictPort: true } });
await server.listen();
console.log('Simulation only: http://127.0.0.1:5502/lobby-monitor?qa=sender');
