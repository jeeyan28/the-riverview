const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { isDeepStrictEqual } = require('node:util');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const destination = path.join(root, 'docs/api/openapi.json');
const update = process.argv.includes('--update');
const manifest = [
  ['auth', '/api/auth'], ['roomRoutes', '/api/rooms'], ['bookingRoutes', '/api/bookings'],
  ['paymongoRoutes', '/api/payments/paymongo', 'router'], ['xenditRoutes', '/api/payments/xendit', 'router'],
  ['monitoringRoutes', '/api/monitor-rooms', 'roomsRouter'], ['monitoringRoutes', '/api/room-sessions', 'sessionsRouter'],
  ['reportRoutes', '/api/reports'], ['forecastRoutes', '/api/forecast'], ['reservationJobsRoutes', '/api/jobs/reservations', 'router'],
];
const normalizeSource = value => String(value).replace(/\r\n?/g, '\n');
const hash = value => createHash('sha256').update(normalizeSource(value)).digest('hex');
const serialize = value => JSON.stringify(value, (_, item) => typeof item === 'function' ? normalizeSource(item.toString()) : item instanceof RegExp ? item.source : item);
const ref = name => ({ $ref: `#/components/schemas/${name}` });
const properties = (fields, description) => ({ type: 'object', description, properties: fields });
const text = { type: 'string' }, number = { type: 'number' }, integer = { type: 'integer' };
const isoDate = { type: 'string', format: 'date' }, at = { type: 'string', format: 'date-time' };

function convert(description) {
  const d = description;
  const types = { object: 'object', string: 'string', number: 'number', boolean: 'boolean', array: 'array', date: 'string' };
  const rules = d.rules || [];
  const s = { ...(types[d.type] ? { type: types[d.type] } : {}), 'x-joi': JSON.parse(serialize(d)) };
  if (d.flags?.description) s.description = d.flags.description;
  if (rules.some(rule => rule.name === 'custom' && String(rule.args?.method).includes('validDateKey'))) s.format = 'date';
  if (d.flags?.default !== undefined && typeof d.flags.default !== 'function') s.default = d.flags.default;
  if (d.type === 'date') s.format = 'date-time';
  if (d.flags?.only && d.allow) s.enum = d.allow;
  if (d.allow?.includes(null) && s.type) s.type = [s.type, 'null'];
  if (d.type === 'object') {
    s.properties = Object.fromEntries(Object.entries(d.keys || {}).filter(([, item]) => item.flags?.presence !== 'forbidden').map(([key, item]) => [key, convert(item)]));
    const required = Object.entries(d.keys || {}).filter(([, item]) => item.flags?.presence === 'required').map(([key]) => key);
    if (required.length) s.required = required;
    s.description = `${s.description || ''} Unknown keys are stripped; validation converts compatible input types. See x-joi for conditional/custom rules.`.trim();
  }
  if (d.type === 'array') s.items = d.items?.length === 1 ? convert(d.items[0]) : {};
  for (const rule of rules) {
    if (rule.name === 'integer') s.type = 'integer';
    if (rule.name === 'email') s.format = 'email';
    if (rule.name === 'guid') s.format = 'uuid';
    if (rule.name === 'pattern' && rule.args?.regex) {
      const regex = String(rule.args.regex); s.pattern = regex.slice(regex.indexOf('/') + 1, regex.lastIndexOf('/'));
    }
    if (['min', 'max', 'length'].includes(rule.name) && typeof rule.args?.limit === 'number') {
      const keys = d.type === 'string' ? ['minLength', 'maxLength'] : d.type === 'array' ? ['minItems', 'maxItems'] : d.type === 'object' ? ['minProperties', 'maxProperties'] : ['minimum', 'maximum'];
      if (rule.name !== 'max') s[keys[0]] = rule.args.limit;
      if (rule.name !== 'min') s[keys[1]] = rule.args.limit;
    }
  }
  return s;
}

const descriptions = {
  '/api/auth/login': 'Creates a cookie session for a verified active account. Account lockout and shared IP/account limits apply. Returns sanitized identity; password is never returned.',
  '/api/auth/me': 'Revalidates account activity, verification and session version. A database failure is 503 SESSION_UNAVAILABLE, not authentication expiry.',
  '/api/auth/logout': 'Destroys the stored session before clearing the cookie. Failure is 503 LOGOUT_UNAVAILABLE; retry is safe and the client retains identity.',
  '/api/auth/forgot-password': 'Generic response independent of account existence. Recovery requires configured SMTP. OTP and reset tokens are short-lived and scoped to the account.',
  '/api/bookings/slots': 'Public aggregated whole-hour start times with server quotes. No customer, reservation or payment identifiers. States: available, full, closed, outside_hours. Uses Asia/Manila service date, including next-calendar-day starts. Browsing does not acquire holds.',
  '/api/bookings/lock': 'Authenticated capacity hold (20 minutes). Real MongoDB transactions serialize competing holds against configured units and closures. Expired holds are logically excluded before TTL deletion. One active hold per user.',
  '/api/bookings/{id}/reschedule': 'Customer ownership or staff authorization is required. Existing policy enforces 24-hour cutoff and at most two reschedules. Rechecks capacity and pricing; recorded prior payments are preserved.',
  '/api/bookings/{id}/cancellation-review': 'Staff reviews cancellation; any money-changing refund exception additionally requires pos:refund. Ordinary customer cancellation retains the original first-hour payment according to the existing policy.',
  '/api/payments/paymongo/intent': 'Persists a stable checkout attempt before the provider POST. Price and amount are server-calculated in PHP, rounded to integer centavos. attemptKey retains the same logical checkout across retries. An unresolved write returns 202 checking and must be reconciled with its original provider. Xendit is chosen only before any write when the primary provider is unconfigured. No automatic charge retry or fallback after a timeout.',
  '/api/payments/paymongo/attempts/{id}': 'Customer status for the original checkout attempt. Cookie authentication and checkout ownership are required. Reads the original provider only; never creates a charge. An unchanged quote and live hold may resume the original unpaid checkout. Returns a safe outcome without hidden metadata.',
  '/api/payments/paymongo/attempts/client/{key}': 'Customer status by the original client UUID when the provider response was interrupted. Cookie authentication and checkout ownership are required. Preserves the original checkout identity; never creates a charge. A missing attempt returns 404.',
  '/api/payments/paymongo/intent/{paymentIntentId}/attach': 'Attaches a card token or supported wallet to the existing intent. Card numbers/CVC go directly to PayMongo from the browser and never belong in this request. Provider status is verified before booking. Uncertain outcomes require checking the original payment.',
  '/api/forecast': 'Authoritative collected revenue less verified refunds, aggregated by Manila business date. Completed history only in rolling-origin evaluation: MAE/RMSE at the actual horizon against last-observation and same-weekday baselines. Insufficient folds are reported. Volatility band is a heuristic range. Bounded cache is five minutes. Synthetic results are labeled.',
  '/api/jobs/reservations': 'Bearer CRON_SECRET only. Database lease fences stale workers across instances. Bounded independent stages: no-shows, refunds, payments, receipts, notifications. Default deadline 45 seconds; maximum 55 seconds. Returns completed or already_running; partial failure is 503 with counts and failedStages. Requires an externally configured scheduler, normally once per minute.',
};

const base = {
  openapi: '3.1.0', info: { title: 'The Riverview API', version: '1.1.0', description: 'Cookie-session venue API. All mutating browser requests require an approved Origin/Referer (APP_BASE_URL); cookies are HttpOnly, SameSite=Lax, Secure in production. Use the frontend same-origin /api proxy. Only signed provider callbacks and the CRON_SECRET trigger have distinct authorization. Business timezone: Asia/Manila. All examples are synthetic. Runtime Joi schemas and access gates are checked by npm run docs:check.' },
  servers: [{ url: 'http://localhost:3000', description: 'Local API' }],
  paths: {}, components: { securitySchemes: { cookieSession: { type: 'apiKey', in: 'cookie', name: 'connect.sid' }, cronBearer: { type: 'http', scheme: 'bearer', description: 'Exact CRON_SECRET bearer token.' }, paymongoSignature: { type: 'apiKey', in: 'header', name: 'Paymongo-Signature', description: 'HMAC-SHA256 over timestamp.rawBody, webhook secret and five-minute freshness.' }, xenditToken: { type: 'apiKey', in: 'header', name: 'x-callback-token', description: 'Timing-safe match with XENDIT_WEBHOOK_TOKEN; resource is retrieved server-side.' } }, schemas: {
    Error: properties({ message: text, code: text, requestId: text, errors: { type: 'array', items: text } }, 'Legacy routes may return only message; stable new service errors include code/requestId.'),
    Message: properties({ message: text, success: { type: 'boolean' }, resetSessionToken: text }),
    Identity: properties({ user: properties({ _id: text, firstName: text, lastName: text, role: { enum: ['user', 'staff', 'manager', 'super_admin'] }, email: text, isVerified: { type: 'boolean' }, isActive: { type: 'boolean' }, permissions: { type: 'array', items: text } }) }),
    Room: properties({ _id: text, name: text, price: number, capacity: integer, variants: { type: 'array', items: properties({ label: text, pax: text, roomCount: integer, price: number, includedGuests: integer, extraGuestFee: number }) } }, 'roomCount is inventory units; capacity/pax is guest maximum. Empty/zero means unknown, not an invented maximum.'),
    Booking: properties({ _id: text, reservationCode: text, guestName: text, room: {}, roomLabel: text, variantLabel: text, date: isoDate, timeIn: text, duration: number, guestCount: integer, amount: number, downPayment: number, paidAmount: number, refundedAmount: number, status: text, paymentStatus: text, receiptStatus: { enum: ['pending', 'sending', 'sent', 'attention', 'not_prepared'] }, closureRefund: {} }),
    Hold: properties({ id: text, expiresAt: at }),
    Availability: properties({ timeZone: { const: 'Asia/Manila' }, serviceDate: isoDate, guestCapacity: { type: ['integer', 'null'] }, operatingHours: {}, slots: { type: 'array', items: properties({ date: isoDate, timeIn: text, startsNextDay: { type: 'boolean' }, state: { enum: ['available', 'full', 'closed', 'outside_hours'] }, reason: text, quote: properties({ amount: number, downPayment: number, remainingBalance: number }) }) } }),
    PaymentOutcome: properties({ status: text, paymentStatus: text, attemptId: text, bookingId: text, reservationCode: text, message: text, receiptStatus: text, resume: properties({ draft: {}, hold: ref('Hold'), checkout: ref('Checkout') }, 'Only the intended customer may resume an original unpaid intent with a live hold and unchanged server quote. Never a new provider charge.') }),
    Checkout: properties({ gateway: { enum: ['paymongo', 'xendit', 'demo'] }, attemptId: text, status: text, amount: number, paymentIntentId: text, clientKey: text, referenceId: text, redirectUrl: { type: 'string', format: 'uri' } }, 'clientKey is a provider client token returned only to the intended customer; never a server secret.'),
    MonitorRoom: properties({ _id: text, facilityName: text, roomName: text, roomNumber: text, price: number, status: text }),
    RoomSession: properties({ _id: text, room: {}, booking: {}, guestName: text, startTime: at, scheduledEndTime: at, duration: number, amount: number, paidAmount: number, paymentStatus: text, status: text }),
    Forecast: properties({ synthetic: { type: 'boolean' }, timeZone: { const: 'Asia/Manila' }, window: integer, forecastRange: text, historyDays: integer, forecastDays: integer, history: { type: 'array', items: properties({ date: isoDate, revenue: number, bookingCount: integer, smaRevenue: { type: ['number', 'null'] }, smaBookings: { type: ['number', 'null'] } }) }, projection: { type: 'array', items: {} }, evaluation: properties({ status: { enum: ['sufficient', 'insufficient_history', 'invalid_history'] }, reason: { type: ['string', 'null'] }, modelVersion: text, horizonDays: integer, foldCount: integer, sampleCount: integer, period: {}, evaluationPeriod: {}, targets: {}, folds: { type: 'array', items: properties({ trainingFrom: isoDate, trainingTo: isoDate, trainingDays: integer, testingFrom: isoDate, testingTo: isoDate }) }, definitions: {}, evaluatedAt: at }), model: {}, rangeLabel: { const: 'Heuristic variability range' }, rangeExplanation: text, estimatesOnly: { const: true } }, 'targets includes revenue/bookings model and baseline MAE/RMSE, bestBaseline and recommendation. No probability coverage is claimed.'),
    SalesReport: properties({ range: properties({ from: isoDate, to: isoDate, source: { enum: ['all', 'booking', 'walkin'] }, timeZone: { const: 'Asia/Manila' }, basis: { const: 'service date' } }), summary: properties({ charged: number, collected: number, outstanding: number, refunded: number, transactions: integer, reservations: integer, walkins: integer, bookedHours: number, averageDuration: number }), rows: { type: 'array', items: {} }, daily: { type: 'array', items: {} }, byFacility: { type: 'array', items: {} }, warnings: { type: 'array', items: text }, synthetic: { type: 'boolean' } }),
    Jobs: properties({ status: { enum: ['completed', 'already_running', 'partial_failure'] }, counts: {}, failedStages: { type: 'array', items: text } }),
    Record: { type: 'object', additionalProperties: true },
  } },
};

function responseSchema(url, method) {
  if (method === 'delete') return ref('Message');
  if (url.startsWith('/api/auth')) return ref(['/me', '/login', '/google'].some(tail => url.endsWith(tail)) ? 'Identity' : 'Message');
  if (url.endsWith('/slots')) return ref('Availability');
  if (url.endsWith('/month-availability')) return { type: 'object', additionalProperties: { type: 'array', items: properties({ timeIn: text, duration: number, status: text }) } };
  if (url === '/api/bookings/availability') return { type: 'array', items: properties({ timeIn: text, duration: number }) };
  if (url === '/api/bookings/lock' && method === 'post') return ref('Hold');
  if (url.startsWith('/api/bookings') && !url.includes('availability') && !url.includes('/lock')) return ['/api/bookings', '/api/bookings/mine'].includes(url) && method === 'get' ? { type: 'array', items: ref('Booking') } : ref('Booking');
  if (url.startsWith('/api/payments/paymongo/attempts/') || url.includes('/status/')) return ref('PaymentOutcome');
  if (url.endsWith('/intent')) return ref('Checkout');
  if (url.includes('/attach') || url.includes('/demo/')) return ref('PaymentOutcome');
  if (url === '/api/jobs/reservations') return ref('Jobs');
  if (url === '/api/forecast') return ref('Forecast');
  if (url === '/api/rooms') return method === 'get' ? { type: 'array', items: ref('Room') } : ref('Room');
  if (url === '/api/rooms/admin') return { type: 'array', items: ref('Room') };
  if (url.startsWith('/api/rooms/')) return ref('Room');
  if (url === '/api/reports') return ref('SalesReport');
  if (url === '/api/room-sessions/{id}/cancel') return properties({ message: text, session: ref('RoomSession'), room: {} });
  if (url.startsWith('/api/monitor-rooms')) return url === '/api/monitor-rooms' && method === 'get' ? { type: 'array', items: ref('MonitorRoom') } : ref('MonitorRoom');
  if (url.startsWith('/api/room-sessions') && !url.includes('report') && !url.includes('availability')) return url === '/api/room-sessions' && method === 'get' ? { type: 'array', items: ref('RoomSession') } : ref('RoomSession');
  return ref('Record');
}

const sampleSelection = { roomId: 'de0000000000000000000015', variantLabel: 'Standard KTV', date: '2099-01-02', timeIn: '13:00', duration: 2 };
const sampleGuest = { guestName: 'Customer, Synthetic', guestEmail: 'customer@example.test', guestContact: '+639170000001', guestCount: 3 };
const sampleNote = 'Synthetic provider evidence reviewed';
function requestExample(url, method, schema) {
  let example;
  if (url.startsWith('/api/auth')) {
    const values = { firstName: 'Synthetic', lastName: 'Customer', email: 'customer@example.test', password: 'ExamplePassword2026!', otp: '000000', resetSessionToken: '0'.repeat(64), code: '<single-use-code-from-Google-popup>' };
    example = Object.fromEntries(Object.keys(schema.describe().keys || {}).map(key => [key, values[key]]));
  } else if (url === '/api/payments/paymongo/intent') example = { ...sampleSelection, ...sampleGuest, paymentChoice: 'deposit', attemptKey: '00000000-0000-4000-8000-000000000001' };
  else if (url.endsWith('/attach')) example = { paymentMethodId: 'pm_synthetic_card_token' };
  else if (url === '/api/bookings/lock') example = sampleSelection;
  else if (url === '/api/bookings' && method === 'post') example = { ...sampleSelection, ...sampleGuest, paidAmount: 400, paymentChoice: 'deposit', paymentMethod: 'Cash', status: 'Confirmed' };
  else if (url.endsWith('/reschedule')) example = { date: '2099-01-03', timeIn: '13:00' };
  else if (url.endsWith('/cancellation-request')) example = { reason: 'Synthetic change of plans' };
  else if (url.endsWith('/cancellation-review')) example = { decision: 'reject', note: sampleNote };
  else if (url === '/api/bookings/{id}' && method === 'put') example = { specialRequests: 'Synthetic updated request' };
  else if (url.startsWith('/api/monitor-rooms') && method === 'post') example = { facilityName: 'KTV Rooms', roomName: 'Standard KTV', roomNumber: '1', price: 400 };
  else if (url.startsWith('/api/monitor-rooms') && method === 'put') example = { status: 'Available' };
  else if (url === '/api/room-sessions' && method === 'post') example = { roomId: 'de000000000000000000012c', duration: 2, guestName: 'Synthetic, Walk-in', guestCount: 2, paymentMethod: 'Cash', paymentStatus: 'Paid', paymentTiming: 'Before' };
  else if (url.endsWith('/extend')) example = { addedHours: 1, collectNow: true, expectedCharge: 400, paymentMethod: 'Cash' };
  else if (url.endsWith('/end')) example = { paid: true };
  else if (url === '/api/room-sessions/{id}' && method === 'put') example = { guestName: 'Synthetic, Corrected' };
  else if (url.startsWith('/api/rooms') && method === 'post') example = { name: 'Synthetic facility', price: 400, capacity: 8, variants: [{ label: 'Standard KTV', price: 400, pax: '8 guests', roomCount: 2 }] };
  else if (url.startsWith('/api/rooms') && method === 'put') example = { name: 'Synthetic facility', description: 'Synthetic updated description', variants: [{ label: 'Standard KTV', price: 400, pax: '8 guests', roomCount: 2 }] };
  else example = {};
  const { error } = schema.validate(example, { stripUnknown: true, convert: true });
  assert(!error, `${url}: documentation request example violates runtime validation: ${error?.message}`);
  return example;
}

const queryParameter = (name, schema, description, required = false) => ({ in: 'query', name, schema, description, required });
function additionalParameters(url, method) {
  if (method !== 'get') return [];
  const dates = [queryParameter('from', isoDate, 'First Manila service date, inclusive.', true), queryParameter('to', isoDate, 'Last Manila service date, inclusive; range 1–92 days.', true)];
  if (url === '/api/reports' || url === '/api/reports/export') return [...dates, queryParameter('source', { type: 'string', enum: ['all', 'booking', 'walkin'], default: 'all' }, 'Ledger channel filter.')];
  if (url === '/api/reports/confirmed-booking-trend') return [queryParameter('interval', { type: 'string', enum: ['daily', 'weekly', 'monthly'], default: 'daily' }, 'Confirmed reservation series interval.')];
  if (url === '/api/forecast') return [queryParameter('window', { type: 'integer', enum: [7, 14, 30], default: 7 }, 'Moving-average window; unsupported values use the default.'), queryParameter('range', { type: 'string', enum: ['daily', 'weekly', 'monthly'], default: 'daily' }, 'Daily horizons 14, 56 or 180; unsupported values use the default.')];
  if (url === '/api/bookings') return ['status', 'cancellationStatus', 'room', 'date', 'from', 'to', 'guestContact', 'guestName', 'search'].map(name => queryParameter(name, ['date', 'from', 'to'].includes(name) ? isoDate : text, 'Optional exact filter; search matches an escaped reservation/name/contact expression. from/to are inclusive.'));
  if (url === '/api/room-sessions/report' || url === '/api/room-sessions/report/export') return dates;
  if (url === '/api/monitor-rooms') return [queryParameter('status', text, 'Optional room status filter.')];
  return [];
}

const responseExamples = {
  Error: { message: 'We could not verify your session right now. Try again.', code: 'SESSION_UNAVAILABLE', requestId: 'synthetic-request-id' },
  Message: { message: 'Request completed.' }, Identity: { user: { _id: 'de0000000000000000000001', firstName: 'Synthetic', lastName: 'Customer', role: 'user', isVerified: true, isActive: true } },
  Room: { _id: sampleSelection.roomId, name: 'KTV Rooms', capacity: 0, variants: [{ label: 'Standard KTV', price: 400, roomCount: 2, pax: '8 guests', includedGuests: 4, extraGuestFee: 25 }] },
  Booking: { _id: 'de0000000000000000000064', reservationCode: 'SYNTHETIC-001', roomLabel: 'KTV Rooms', variantLabel: 'Standard KTV', date: sampleSelection.date, timeIn: '13:00', duration: 2, amount: 800, downPayment: 400, paidAmount: 400, paymentStatus: 'Partial', status: 'Confirmed', receiptStatus: 'pending' },
  Hold: { id: 'de00000000000000000000d2', expiresAt: '2099-01-02T05:20:00.000Z' },
  Availability: { serviceDate: sampleSelection.date, timeZone: 'Asia/Manila', guestCapacity: 8, operatingHours: { openTime: '07:00', closeTime: '02:00' }, slots: [{ date: sampleSelection.date, timeIn: '13:00', state: 'available', startsNextDay: false, quote: { amount: 800, downPayment: 400, remainingBalance: 400 } }] },
  PaymentOutcome: { status: 'checking', attemptId: 'rv-00000000-0000-4000-8000-000000000001', message: 'We are checking your payment. Please do not start another payment.' },
  Checkout: { gateway: 'paymongo', attemptId: 'rv-00000000-0000-4000-8000-000000000001', paymentIntentId: 'pi_synthetic', clientKey: '<provider-client-token>', amount: 400 },
  MonitorRoom: { _id: 'de000000000000000000012c', facilityName: 'KTV Rooms', roomName: 'Standard KTV', roomNumber: '1', price: 400, status: 'Available' },
  RoomSession: { _id: 'de0000000000000000000136', guestName: 'Synthetic, Walk-in', startTime: '2099-01-02T05:00:00.000Z', scheduledEndTime: '2099-01-02T07:00:00.000Z', duration: 2, amount: 800, paidAmount: 800, paymentStatus: 'Paid', status: 'Active' },
  Forecast: { synthetic: true, timeZone: 'Asia/Manila', forecastRange: 'daily', forecastDays: 14, window: 7, history: [], projection: [], evaluation: { status: 'insufficient_history', foldCount: 0, horizonDays: 14, sampleCount: 0, targets: {}, reason: 'Insufficient recorded history.' }, rangeLabel: 'Heuristic variability range', estimatesOnly: true },
  Jobs: { status: 'completed', counts: { receipts: { sent: 1 } }, failedStages: [] }, SalesReport: { synthetic: true, range: { from: '2099-01-01', to: '2099-01-02', source: 'all', basis: 'service date', timeZone: 'Asia/Manila' }, summary: { collected: 400, charged: 800, outstanding: 400, refunded: 0, transactions: 1 }, rows: [], daily: [], byFacility: [], warnings: [] },
};

function buildRuntime(previous) {
  const doc = structuredClone(base);
  for (const [name, example] of Object.entries(responseExamples)) doc.components.schemas[name].example = example;
  doc['x-domain-sha256'] = Object.fromEntries(['bookingHelper', 'roomPricing', 'paymentAttempts', 'paymentReconciliation', 'closureRefunds', 'receiptOutbox', 'forecastEvaluation', 'reservationJobs', 'rateLimitStore'].map(name => [`utils/${name}.js`, hash(fs.readFileSync(path.join(root, 'utils', `${name}.js`)))]));
  for (const [file, prefix, exportName] of manifest) {
    const module = require(path.join(root, 'routes', file));
    const router = exportName ? module[exportName] : module;
    const globalGates = router.stack.filter(layer => !layer.route).map(layer => layer.handle.apiAccess).filter(Boolean);
    for (const layer of router.stack.filter(item => item.route)) for (const method of Object.keys(layer.route.methods)) {
      const url = (prefix + (layer.route.path === '/' ? '' : layer.route.path)).replace(/:([A-Za-z]+)/g, '{$1}');
      const old = previous?.paths?.[url]?.[method];
      const gates = [...globalGates, ...layer.route.stack.map(item => item.handle.apiAccess).filter(Boolean)];
      const secured = gates.length > 0;
      const operation = {
        ...(old || {}), operationId: `${method}_${url.replace(/[^a-zA-Z0-9]/g, '_')}`, tags: [prefix],
        summary: old?.summary || `${method.toUpperCase()} ${url}`, description: old?.description || descriptions[url] || 'Uses the existing venue policy and server-side validation. Mutating browser requests require an approved origin. Refer to request constraints and x-access for the authoritative gate.',
        'x-source': `routes/${file}.js`, 'x-source-sha256': hash(fs.readFileSync(path.join(root, 'routes', `${file}.js`))), 'x-access': gates, 'x-validation': [],
        security: url === '/api/jobs/reservations' ? [{ cronBearer: [] }] : secured ? [{ cookieSession: [] }] : [],
        parameters: [], responses: {
          '200': { description: 'Successful outcome', content: { 'application/json': { schema: responseSchema(url, method) } } },
          '400': { description: 'Invalid input or impossible date/policy', content: { 'application/json': { schema: ref('Error') } } },
          ...(secured ? { '401': { description: 'Absent/expired/invalidated account session' }, '403': { description: 'Ownership, role or permission denied' } } : {}),
          ...(method !== 'get' ? { '403': { description: 'Forbidden origin/permission; synthetic demo financial writes are read-only' } } : {}),
          '404': { description: 'Resource not found' }, '409': { description: 'Capacity, policy or payment verification conflict' }, '410': { description: 'Hold/provider session expired where applicable' },
          '429': { description: 'Shared rate limit reached; Retry-After header when limited', headers: { 'Retry-After': { schema: integer } } },
          '500': { description: 'Unexpected persistence/processing failure; retry callback only after required state is durable' }, '503': { description: 'Temporary database, session, job or integration failure', content: { 'application/json': { schema: ref('Error') } } },
        },
      };
      delete operation.requestBody;
      if (method === 'post') operation.responses['201'] = { description: 'Resource created; see 200 schema', content: operation.responses['200'].content };
      if (url.endsWith('/intent')) operation.responses['202'] = { description: 'Original provider write is uncertain; check status, do not pay again', content: { 'application/json': { schema: ref('Checkout'), example: { status: 'checking', gateway: 'paymongo', attemptId: 'rv-00000000-0000-4000-8000-000000000001', message: 'We are checking your payment. Please do not start another payment.' } } } };
      if (url.includes('/export')) operation.responses['200'].content = { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { schema: { type: 'string', format: 'binary' } } };
      for (const item of layer.route.stack) if (item.handle.apiValidation) {
        const { schema, source } = item.handle.apiValidation;
        const d = schema.describe(), signature = hash(serialize(d)), name = `Input_${signature.slice(0, 12)}`;
        doc.components.schemas[name] = convert(d);
        operation['x-validation'] ||= [];
        operation['x-validation'].push({ source, signature });
        if (source === 'body') operation.requestBody = { required: Object.values(d.keys || {}).some(value => value.flags?.presence === 'required'), content: { 'application/json': { schema: ref(name), example: requestExample(url, method, schema) }, ...(url === '/api/bookings' || prefix === '/api/rooms' ? { 'multipart/form-data': { schema: ref(name) } } : {}) } };
        else for (const [key, value] of Object.entries(d.keys || {})) operation.parameters.push({ in: source === 'params' ? 'path' : 'query', name: key, required: source === 'params' || value.flags?.presence === 'required', schema: convert(value) });
      }
      for (const name of url.matchAll(/\{([^}]+)}/g)) if (!operation.parameters.some(item => item.in === 'path' && item.name === name[1])) operation.parameters.push({ in: 'path', name: name[1], required: true, schema: text });
      if (method !== 'get') operation.parameters.push({ in: 'header', name: 'Origin', required: false, schema: { type: 'string', format: 'uri' }, example: 'http://localhost:5501', description: 'An APP_BASE_URL origin or matching Referer is required. Separate provider callbacks are exempt.' });
      if (old?.['x-extra-parameters']) operation.parameters.push(...old['x-extra-parameters']);
      for (const parameter of additionalParameters(url, method)) if (!operation.parameters.some(item => item.name === parameter.name && item.in === parameter.in)) operation.parameters.push(parameter);
      doc.paths[url] ||= {}; doc.paths[url][method] = operation;
    }
  }
  for (const provider of ['paymongo', 'xendit']) doc.paths[`/api/payments/${provider}/webhook`] = { post: {
    operationId: `post_${provider}_webhook`, tags: ['Provider callbacks'], summary: `${provider} authenticated callback`, description: 'Callback authenticates the sender then retrieves provider state server-side. Browser query or callback amounts never establish success. Duplicate/concurrent callbacks converge. A successful acknowledgment follows durable booking/incident/refund state; temporary verification/persistence failure returns 500 for provider retry.',
    security: [{ [provider === 'paymongo' ? 'paymongoSignature' : 'xenditToken']: [] }],
    requestBody: { required: true, content: { 'application/json': { schema: properties({ data: {} }, provider === 'paymongo' ? 'Exact raw JSON bytes are HMAC-verified before parsing.' : 'Xendit session/refund event with reference_id/session/payment ID; retrieved resource must match the attempt.') } } },
    responses: { '200': { description: 'Verified durable result or irrelevant authenticated event', content: { 'application/json': { schema: properties({ received: { const: true } }) } } }, '400': { description: 'Invalid signature, timestamp or JSON' }, '401': { description: 'Invalid Xendit callback token' }, '500': { description: 'Retry required; required outcome was not persisted' }, '503': { description: 'Database unavailable; do not acknowledge processing' } },
  } };
  return doc;
}

const previous = fs.existsSync(destination) ? JSON.parse(fs.readFileSync(destination, 'utf8')) : null;
const actual = JSON.parse(JSON.stringify(buildRuntime(previous)));
if (update) { fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, JSON.stringify(actual, null, 2) + '\n'); }
else {
  assert(previous, 'API documentation is missing. Run node scripts/checkApiDocs.js --update after reviewing route descriptions.');
  assert(isDeepStrictEqual(previous, actual), 'API contract drift: review changed handlers, schemas and permissions, then run node scripts/checkApiDocs.js --update.');
  for (const [url, methods] of Object.entries(previous.paths)) for (const op of Object.values(methods)) {
    assert(op.operationId && op.responses?.['200'], `${url}: missing operation/response`);
    for (const p of op.parameters || []) assert(p.name && p.in && p.schema, `${url}: invalid parameter`);
  }
  const operationIds = new Set();
  function checkReferences(value) {
    if (!value || typeof value !== 'object') return;
    if (value.$ref) {
      assert(value.$ref.startsWith('#/'), 'API contract references must resolve within this document.');
      assert(value.$ref.slice(2).split('/').reduce((part, key) => part?.[key], previous), `Unresolved API schema: ${value.$ref}`);
    }
    for (const child of Object.values(value)) checkReferences(child);
  }
  checkReferences(previous);
  for (const [url, methods] of Object.entries(previous.paths)) for (const op of Object.values(methods)) {
    assert(!operationIds.has(op.operationId), `Duplicate API operation: ${op.operationId}`);
    operationIds.add(op.operationId);
    for (const match of url.matchAll(/\{([^}]+)}/g)) assert(op.parameters.some(item => item.in === 'path' && item.name === match[1] && item.required), `${url}: missing required path parameter`);
    for (const scheme of op.security || []) for (const name of Object.keys(scheme)) assert(previous.components.securitySchemes[name], `Unknown API authentication scheme: ${name}`);
  }
}
console.log(`API contract ${update ? 'updated' : 'verified'}: ${Object.keys(actual.paths).length} paths, ${Object.values(actual.paths).reduce((sum, methods) => sum + Object.keys(methods).length, 0)} operations; runtime validation and permission gates match.`);
