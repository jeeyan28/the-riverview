import {
  lobbyPresentationSupport, lobbyPresentationUrl, presentationErrorMessage,
  presentationMessage, readPresentationMessage,
} from '../utils/lobbyPresentation.js';

export class LobbyPresentationController {
  constructor(environment, onChange) {
    this.environment = environment;
    this.onChange = onChange;
    this.connection = null;
    this.pending = null;
    this.snapshot = null;
    this.disposed = false;
    this.cleanConnection = () => {};
    this.status = { ...lobbyPresentationSupport(environment), phase: 'idle', availability: 'unknown', canStop: false };
    if (this.status.supported) {
      try {
        this.request = new environment.PresentationRequest(lobbyPresentationUrl(environment.location.origin));
        this.onAvailable = (event) => this.attach(event.connection);
        this.request.addEventListener('connectionavailable', this.onAvailable);
      } catch (error) {
        this.status = { ...this.status, supported: false, message: presentationErrorMessage(error) };
      }
    }
    this.publish({});
  }

  publish(patch) {
    this.status = { ...this.status, ...patch };
    if (!this.disposed) this.onChange(this.status);
  }

  observeAvailability() {
    try {
      this.request?.getAvailability().then((availability) => {
        if (this.disposed) return;
        this.availability = availability;
        this.onAvailabilityChange = () => this.publish({ availability: availability.value ? 'available' : 'unavailable' });
        availability.addEventListener('change', this.onAvailabilityChange);
        this.onAvailabilityChange();
      }).catch(() => {});
    } catch {
      // Availability is advisory; the picker can still work.
    }
  }

  setSnapshot(snapshot) {
    this.snapshot = snapshot;
    this.sendSnapshot();
  }

  sendSnapshot() {
    if (this.disposed || this.connection?.state !== 'connected' || !this.snapshot) return;
    try {
      this.connection.send(presentationMessage('snapshot', this.snapshot));
    } catch {
      this.publish({ message: 'Connected, but dashboard updates could not be sent. Stop casting and try again.' });
    }
  }

  start() {
    if (this.disposed || !this.request) return;
    if (this.pending) return this.pending;
    if (['connected', 'connecting'].includes(this.connection?.state)) {
      this.sendSnapshot();
      return Promise.resolve(this.connection);
    }
    const reconnecting = this.connection?.state === 'closed';
    let operation;
    try {
      // Keep start in the click's synchronous call stack.
      operation = reconnecting ? this.request.reconnect(this.connection.id) : this.request.start();
    } catch (error) {
      this.publish({ phase: 'error', message: presentationErrorMessage(error) });
      return;
    }
    this.publish({ phase: reconnecting ? 'connecting' : 'selecting', message: reconnecting ? 'Reconnecting to the existing TV session…' : 'Choose your Chromecast in Chrome’s device picker.' });
    this.pending = Promise.resolve(operation).then((connection) => {
      this.attach(connection);
      return connection;
    }).catch((error) => {
      if (reconnecting) {
        this.cleanConnection();
        this.connection = null;
      }
      this.publish({ phase: 'error', canStop: false, message: reconnecting
        ? 'The previous TV session could not be reconnected. Click View on TV again to choose a device for a new session.'
        : presentationErrorMessage(error) });
    }).finally(() => { this.pending = null; });
    return this.pending;
  }

  attach(connection) {
    if (this.disposed) {
      try { connection.terminate(); } catch {}
      return;
    }
    if (this.connection === connection && connection.state !== 'closed') return;
    this.cleanConnection();
    this.connection = connection;
    const connected = () => {
      this.publish({ phase: 'connected', canStop: true, message: 'Connected to TV. Loading the dashboard…' });
      this.clearReadyTimeout();
      this.readyTimeout = this.environment.setTimeout(() => {
        this.publish({ message: 'The TV connected but has not loaded the dashboard. Stop casting and retry, or use the fullscreen fallback.' });
      }, 15000);
      this.sendSnapshot();
    };
    const message = (event) => {
      const value = readPresentationMessage(event.data);
      if (value?.type === 'ready') this.sendSnapshot();
      if (value?.type === 'ack') {
        this.clearReadyTimeout();
        this.publish({ phase: 'connected', canStop: true, message: 'Casting to TV. Dashboard selections and live updates are synced.' });
      }
    };
    const close = (event) => {
      this.clearReadyTimeout();
      this.publish({ phase: 'disconnected', canStop: false, message: event.reason === 'wentaway'
        ? 'The TV went away. Check its power and Wi-Fi, then reconnect.'
        : 'The TV connection closed. Click Reconnect to TV to resume the existing session.' });
    };
    const terminate = () => {
      this.clearReadyTimeout();
      this.publish({ phase: 'terminated', canStop: false, message: 'Casting stopped. View on TV opens the picker for a new session.' });
    };
    const listeners = { connect: connected, message, close, terminate };
    Object.entries(listeners).forEach(([name, handler]) => connection.addEventListener(name, handler));
    this.cleanConnection = () => {
      this.clearReadyTimeout();
      Object.entries(listeners).forEach(([name, handler]) => connection.removeEventListener(name, handler));
    };
    if (connection.state === 'connected') connected();
    else if (connection.state === 'closed') close({});
    else if (connection.state === 'terminated') terminate();
    else this.publish({ phase: 'connecting', canStop: true, message: 'Connecting to TV…' });
  }

  clearReadyTimeout() {
    this.environment.clearTimeout(this.readyTimeout);
  }

  stop() {
    if (!this.connection || !['connecting', 'connected'].includes(this.connection.state)) return;
    try {
      this.publish({ phase: 'stopping', message: 'Stopping casting…' });
      this.connection.terminate();
      this.clearReadyTimeout();
    } catch {
      this.publish({ phase: 'connected', canStop: true, message: 'Chrome could not stop casting. Try Stop casting again, or stop from Chrome’s Cast menu.' });
    }
  }

  dispose() {
    this.disposed = true;
    this.cleanConnection();
    this.availability?.removeEventListener('change', this.onAvailabilityChange);
    this.request?.removeEventListener('connectionavailable', this.onAvailable);
    try { this.connection?.terminate(); } catch {}
  }
}

export function receiveLobbyPresentation(receiver, onSnapshot, onStatus, timers = globalThis) {
  let disposed = false;
  let list;
  const connections = new Map();
  const send = (connection, type) => {
    if (connection.state !== 'connected') return;
    try { connection.send(presentationMessage(type)); } catch {}
  };
  const attach = (connection) => {
    if (disposed || connections.has(connection)) return;
    const ready = () => send(connection, 'ready');
    const message = (event) => {
      const value = readPresentationMessage(event.data);
      if (value?.type !== 'snapshot') return;
      onSnapshot(value.snapshot);
      onStatus('');
      send(connection, 'ack');
    };
    const closed = () => {
      if (![...connections.keys()].some((item) => item.state === 'connected')) {
        onSnapshot(null);
        onStatus('The laptop disconnected. Reconnect from the lobby display on the laptop.');
      }
    };
    const listeners = { connect: ready, message, close: closed, terminate: closed };
    Object.entries(listeners).forEach(([name, handler]) => connection.addEventListener(name, handler));
    connections.set(connection, () => Object.entries(listeners).forEach(([name, handler]) => connection.removeEventListener(name, handler)));
    ready();
  };
  const available = (event) => attach(event.connection);
  Promise.resolve(receiver.connectionList).then((connectionList) => {
    if (disposed) return;
    list = connectionList;
    list.addEventListener('connectionavailable', available);
    list.connections.forEach(attach);
  }).catch(() => {
    if (!disposed) onStatus('The TV could not connect to the dashboard. Stop casting on the laptop and try again.');
  });
  const heartbeat = timers.setInterval(() => connections.forEach((_, connection) => send(connection, 'ready')), 5000);
  return () => {
    disposed = true;
    timers.clearInterval(heartbeat);
    list?.removeEventListener('connectionavailable', available);
    connections.forEach((cleanup) => cleanup());
  };
}
