import test from 'node:test';
import assert from 'node:assert/strict';
import { LobbyPresentationController, receiveLobbyPresentation } from '../../src/services/lobbyPresentation.js';
import {
  isLobbyPresentationReceiver, lobbyPresentationSupport, lobbyPresentationUrl,
  lobbySnapshot, presentationMessage, readPresentationMessage,
} from '../../src/utils/lobbyPresentation.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const emit = (target, type, detail = {}) => target.dispatchEvent(Object.assign(new Event(type), detail));

class Connection extends EventTarget {
  constructor(state = 'connected') {
    super();
    this.id = 'testpresentation0001';
    this.state = state;
    this.messages = [];
    this.terminations = 0;
  }
  send(data) {
    assert.equal(this.state, 'connected');
    this.messages.push(JSON.parse(data));
    if (this.peer) queueMicrotask(() => emit(this.peer, 'message', { data }));
  }
  terminate() {
    this.terminations++;
    this.state = 'terminated';
    emit(this, 'terminate');
  }
  connect() { this.state = 'connected'; emit(this, 'connect'); }
  close() { this.state = 'closed'; emit(this, 'close', { reason: 'wentaway' }); }
}

function setup() {
  const timers = new Map();
  let nextTimer = 0;
  const environment = {
    isSecureContext: true, navigator: { presentation: {} }, location: { origin: 'http://localhost:5501' },
    setTimeout: (fn) => { timers.set(++nextTimer, fn); return nextTimer; },
    clearTimeout: (id) => timers.delete(id),
    setInterval: (fn) => { timers.set(++nextTimer, fn); return nextTimer; },
    clearInterval: (id) => timers.delete(id),
  };
  let request;
  environment.PresentationRequest = class extends EventTarget {
    constructor(url) {
      super();
      this.url = url;
      this.starts = 0;
      this.reconnections = [];
      this.next = deferred();
      this.availability = Object.assign(new EventTarget(), { value: true });
      request = this;
    }
    start() { this.starts++; return this.next.promise; }
    reconnect(id) { this.reconnections.push(id); return this.next.promise; }
    getAvailability() { return Promise.resolve(this.availability); }
  };
  const changes = [];
  const controller = new LobbyPresentationController(environment, (status) => changes.push(status));
  return { environment, request, controller, changes, timers };
}

const sample = () => lobbySnapshot({
  rooms: [{ _id: 'r1', facilityName: 'KTV', roomName: 'VIP', roomNumber: 2, status: 'Occupied', price: 400, privateNotes: 'omit' }],
  sessions: [
    { _id: 's1', room: { _id: 'r1', privateNotes: 'omit' }, status: 'Active', startTime: '2026-09-29T04:00:00Z', duration: 2, guestName: 'Guest', rate: 400, amount: 800, paidAmount: 800, paymentStatus: 'Paid', customerEmail: 'omit' },
    { _id: 's2', status: 'Finished' },
  ],
  loading: false, lastUpdatedAt: Date.now(),
  selection: { facilityFilter: 'KTV', roomTypeFilter: 'VIP', viewMode: 'table', sortBy: 'price', theme: 'light' },
});

test('feature detection distinguishes secure contexts and unsupported browsers', () => {
  const { environment } = setup();
  assert.equal(lobbyPresentationSupport(environment).supported, true);
  assert.match(lobbyPresentationSupport({ ...environment, isSecureContext: false }).message, /HTTPS or localhost/);
  assert.match(lobbyPresentationSupport({ ...environment, PresentationRequest: undefined }).message, /desktop Google Chrome/);
  assert.equal(isLobbyPresentationReceiver({ presentation: { receiver: {} } }), true);
  assert.equal(isLobbyPresentationReceiver({ presentation: {} }), false);
  assert.equal(isLobbyPresentationReceiver({}), false);
});

test('uses the existing HTTP(S) route, without credentials or a custom receiver ID', () => {
  assert.equal(lobbyPresentationUrl('https://example.test'), 'https://example.test/lobby-monitor?presentation=1');
  assert.equal(lobbyPresentationUrl('http://localhost:5501'), 'http://localhost:5501/lobby-monitor?presentation=1');
});

test('start runs synchronously in the click and duplicate clicks share the pending picker', async () => {
  const { controller, request } = setup();
  let activated = true;
  request.start = () => { assert.equal(activated, true); request.starts++; return request.next.promise; };
  const first = controller.start();
  activated = false;
  assert.equal(request.starts, 1);
  assert.equal(controller.start(), first);
  const connection = new Connection('connecting');
  emit(request, 'connectionavailable', { connection });
  request.next.resolve(connection);
  await first;
  connection.connect();
  await controller.start();
  assert.equal(request.starts, 1);
  assert.equal(controller.status.phase, 'connected');
  controller.dispose();
});

test('receiver loads independently and ready handshake recovers the initial snapshot', async () => {
  const { controller, request, environment } = setup();
  const sender = new Connection();
  controller.setSnapshot(sample());
  const pending = controller.start();
  request.next.resolve(sender);
  await pending;
  const receiverConnection = new Connection();
  sender.peer = receiverConnection;
  receiverConnection.peer = sender;
  const list = Object.assign(new EventTarget(), { connections: [receiverConnection] });
  const snapshots = [];
  const cleanup = receiveLobbyPresentation({ connectionList: Promise.resolve(list) }, (data) => snapshots.push(data), () => {}, environment);
  await flush();
  assert.deepEqual(snapshots.at(-1), controller.snapshot);
  assert.match(controller.status.message, /synced/);
  const changed = { ...sample(), selection: { ...sample().selection, facilityFilter: 'All', roomTypeFilter: 'All', viewMode: 'grid', theme: 'dark', sortBy: 'status' } };
  changed.rooms[0].status = 'Available';
  changed.sessions = [];
  controller.setSnapshot(changed);
  await flush();
  assert.deepEqual(snapshots.at(-1), changed);
  assert.equal(snapshots.at(-1).rooms[0].privateNotes, undefined);
  cleanup();
  controller.dispose();
});

test('only display fields and active sessions cross the connection', () => {
  const value = sample();
  assert.equal(value.sessions.length, 1);
  assert.equal(value.sessions[0].room, 'r1');
  assert.equal(value.sessions[0].customerEmail, undefined);
  assert.equal(value.rooms[0].privateNotes, undefined);
  assert.equal(value.selection.roomTypeFilter, 'VIP');
  assert.equal(value.sessions[0].guestName, 'Guest');
});

test('malformed messages are ignored and unknown selection values are normalized', () => {
  for (const data of ['not json', 'null', '{}', new ArrayBuffer(2), presentationMessage('snapshot', { rooms: [null] })]) {
    assert.equal(readPresentationMessage(data), null);
  }
  const value = sample();
  value.selection.sortBy = 'invalid';
  assert.equal(readPresentationMessage(presentationMessage('snapshot', value)).snapshot.selection.sortBy, 'default');
});

for (const [name, text] of [
  ['NotAllowedError', /cancelled/], ['AbortError', /cancelled/], ['NotFoundError', /TV not found/],
  ['NotSupportedError', /cannot stream/], ['SecurityError', /HTTPS or localhost/],
  ['InvalidAccessError', /direct click/], ['OperationError', /device picker/], ['NetworkError', /Wi-Fi/],
]) {
  test(`${name} produces an actionable message and allows another click`, async () => {
    const { controller, request } = setup();
    const pending = controller.start();
    request.next.reject(Object.assign(new Error(), { name }));
    await pending;
    assert.match(controller.status.message, text);
    assert.equal(controller.status.canStop, false);
    request.next = deferred();
    const retry = controller.start();
    assert.equal(request.starts, 2);
    request.next.resolve(new Connection());
    await retry;
    controller.dispose();
  });
}

test('unavailable devices and unavailable discovery do not block a fresh picker', async () => {
  const { controller, request } = setup();
  request.availability.value = false;
  controller.observeAvailability();
  await flush();
  assert.equal(controller.status.availability, 'unavailable');
  assert.equal(controller.status.supported, true);
  const pending = controller.start();
  assert.equal(request.starts, 1);
  request.next.resolve(new Connection());
  await pending;
  request.getAvailability = () => Promise.reject(new Error('unsupported discovery'));
  controller.observeAvailability();
  await flush();
  assert.equal(controller.status.phase, 'connected');
  controller.dispose();
});

test('reconnects a closed session and requires a new click if it no longer exists', async () => {
  const { controller, request } = setup();
  const connection = new Connection();
  const pending = controller.start();
  request.next.resolve(connection);
  await pending;
  connection.close();
  assert.equal(controller.status.phase, 'disconnected');
  request.next = deferred();
  const reconnecting = controller.start();
  assert.deepEqual(request.reconnections, [connection.id]);
  assert.equal(request.starts, 1);
  request.next.reject(Object.assign(new Error(), { name: 'NotFoundError' }));
  await reconnecting;
  assert.match(controller.status.message, /Click View on TV again/);
  assert.equal(request.starts, 1);
  request.next = deferred();
  const next = controller.start();
  assert.equal(request.starts, 2);
  request.next.resolve(new Connection());
  await next;
  controller.dispose();
});

test('Stop casting terminates; a later session opens a new picker', async () => {
  const { controller, request } = setup();
  const connection = new Connection();
  const pending = controller.start();
  request.next.resolve(connection);
  await pending;
  controller.stop();
  assert.equal(connection.terminations, 1);
  assert.equal(controller.status.phase, 'terminated');
  assert.equal(controller.status.canStop, false);
  request.next = deferred();
  const next = controller.start();
  assert.equal(request.starts, 2);
  request.next.resolve(new Connection());
  await next;
  controller.dispose();
});

test('disposing during device selection terminates a late connection', async () => {
  const { controller, request } = setup();
  const pending = controller.start();
  controller.dispose();
  const connection = new Connection();
  request.next.resolve(connection);
  await pending;
  assert.equal(connection.terminations, 1);
});

test('an existing closed connection can reconnect without another picker', async () => {
  const { controller, request } = setup();
  const connection = new Connection('closed');
  controller.attach(connection);
  const reconnect = controller.start();
  connection.state = 'connecting';
  request.next.resolve(connection);
  await reconnect;
  connection.connect();
  assert.equal(controller.status.phase, 'connected');
  assert.equal(request.starts, 0);
  controller.stop();
  assert.equal(connection.terminations, 1);
  controller.dispose();
});

test('Stop casting can terminate a connecting session and recover from a stop error', () => {
  const { controller } = setup();
  const connection = new Connection('connecting');
  controller.attach(connection);
  const terminate = connection.terminate.bind(connection);
  connection.terminate = () => { throw new Error('fixture stop failure'); };
  controller.stop();
  assert.equal(controller.status.canStop, true);
  assert.notEqual(controller.status.phase, 'stopping');
  assert.match(controller.status.message, /Try Stop casting again/);
  connection.terminate = terminate;
  controller.stop();
  assert.equal(controller.status.phase, 'terminated');
  controller.dispose();
});

test('a synchronous start failure is handled without losing retry support', () => {
  const { controller, request } = setup();
  request.start = () => { throw Object.assign(new Error(), { name: 'SecurityError' }); };
  controller.start();
  assert.equal(controller.status.phase, 'error');
  assert.match(controller.status.message, /HTTPS or localhost/);
  assert.equal(controller.pending, null);
  controller.dispose();
});

test('no receiver acknowledgement reports loading failure and retains Stop casting', async () => {
  const { controller, request, timers } = setup();
  const pending = controller.start();
  request.next.resolve(new Connection());
  await pending;
  [...timers.values()].forEach((fn) => fn());
  assert.match(controller.status.message, /has not loaded/);
  assert.equal(controller.status.canStop, true);
  controller.dispose();
  assert.equal(timers.size, 0);
});

test('receiver handles late connections, disconnection, and cleanup', async () => {
  const { environment, timers } = setup();
  const list = Object.assign(new EventTarget(), { connections: [] });
  const snapshots = [], statuses = [];
  const cleanup = receiveLobbyPresentation({ connectionList: Promise.resolve(list) }, (value) => snapshots.push(value), (value) => statuses.push(value), environment);
  await flush();
  const connection = new Connection('connecting');
  emit(list, 'connectionavailable', { connection });
  connection.connect();
  assert.equal(connection.messages.at(-1).type, 'ready');
  emit(connection, 'message', { data: presentationMessage('snapshot', sample()) });
  assert.equal(connection.messages.at(-1).type, 'ack');
  assert.equal(snapshots.at(-1).selection.viewMode, 'table');
  connection.close();
  assert.equal(snapshots.at(-1), null);
  assert.match(statuses.at(-1), /disconnected/);
  cleanup();
  assert.equal(timers.size, 0);
  const count = snapshots.length;
  emit(connection, 'message', { data: presentationMessage('snapshot', sample()) });
  assert.equal(snapshots.length, count);
});
