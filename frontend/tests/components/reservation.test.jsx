import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GuestAvailability from '../../src/components/GuestAvailability';
import { CheckoutStep } from '../../src/components/booking/BookingPaymentSteps';
import { PaymentVerificationStep } from '../../src/components/booking/PaymentVerificationStep';
import { usePublicAvailability } from '../../src/hooks/usePublicAvailability';
import { usePaymentPolling } from '../../src/hooks/usePaymentPolling';
import { useBookingHold } from '../../src/hooks/useBookingHold';
import { bookingsService } from '../../src/services/bookings';
import { paymentsService } from '../../src/services/payments';
import App from '../../src/App';

vi.mock('../../src/services/bookings', () => ({ bookingsService: { slots: vi.fn(), get: vi.fn(), lockSlot: vi.fn(), releaseLock: vi.fn() } }));
vi.mock('../../src/services/payments', () => ({ paymentsService: { attemptStatus: vi.fn(), status: vi.fn() } }));
vi.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: null, sessionVerified: false }) }));
vi.mock('../../src/layouts/MainLayout', () => ({ default: () => <main aria-label="Public website" /> }));
const room = { _id: '507f1f77bcf86cd799439011', name: 'Synthetic room', variants: [{ label: 'Standard', price: 100, roomCount: 1, pax: '6 guests', includedGuests: 0, extraGuestFee: 20 }] };
const selection = { roomId: room._id, variantLabel: 'Standard', date: '2099-01-02', duration: 1, guestCount: 1, paymentChoice: 'deposit' };
const response = (date = selection.date, state = 'available') => ({ serviceDate: date, timeZone: 'Asia/Manila', guestCapacity: 6, operatingHours: { openTime: '07:00', closeTime: '02:00' }, slots: [{ date, timeIn: '10:00', displayHour: 10, state, quote: state === 'available' ? { amount: 120, downPayment: 120, remainingBalance: 0 } : undefined }] });
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
beforeEach(() => { vi.resetAllMocks(); const values = new Map(); vi.stubGlobal('sessionStorage', { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('PayMongo popup return', () => {
  it.each([false, true])('closes before rendering the website, even when focusing fails (%s)', focusFails => {
    const focus = vi.fn(() => { if (focusFails) throw new Error('Focus unavailable'); });
    vi.stubGlobal('opener', { closed: false, focus });
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    render(<MemoryRouter initialEntries={['/?paymongo=success&paymentIntentId=pi_original']}><App /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Returning to your reservation' })).toBeTruthy();
    expect(screen.queryByRole('main', { name: 'Public website' })).toBeNull();
    expect(focus).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(paymentsService.status).not.toHaveBeenCalled();
  });
  it.each([
    { closed: null, path: '/?paymongo=success&paymentIntentId=pi_original' },
    { closed: true, path: '/?paymongo=success&paymentIntentId=pi_original' },
    { closed: false, path: '/?paymongo=success' },
    { closed: false, path: '/' },
  ])('keeps normal website routing for same-tab, closed-opener and incomplete returns (%j)', ({ closed, path }) => {
    vi.stubGlobal('opener', closed === null ? null : { closed, focus: vi.fn() });
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
    expect(screen.getByRole('main', { name: 'Public website' })).toBeTruthy();
    expect(close).not.toHaveBeenCalled();
  });
});

describe('public availability', () => {
  it('makes the selected time explicit without implying a confirmed reservation', async () => {
    bookingsService.slots.mockResolvedValue(response());
    render(<MemoryRouter><GuestAvailability room={room} initialDraft={{ ...selection, serviceDate: selection.date }} onContinue={() => {}} /></MemoryRouter>);
    const slot = await screen.findByRole('button', { name: '10:00 AM, Available' });
    fireEvent.click(slot);
    expect(screen.getByRole('button', { name: '10:00 AM, Selected' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Your selection' })).toBeTruthy();
    expect(screen.getByText(/No payment or reservation yet/)).toBeTruthy();
    expect(bookingsService.lockSlot).not.toHaveBeenCalled();
  });
  it('cancels stale requests and never substitutes an old day for a new selection', async () => {
    const first = deferred(), second = deferred(); bookingsService.slots.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(value => usePublicAvailability(value), { initialProps: selection });
    rerender({ ...selection, date: '2099-01-03' });
    expect(bookingsService.slots.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => second.resolve(response('2099-01-03')));
    await act(async () => first.resolve(response()));
    expect(result.current.status).toBe('ready'); expect(result.current.data.serviceDate).toBe('2099-01-03');
  });
  it('shows a service error with retry instead of treating failure as zero inventory', async () => {
    bookingsService.slots.mockRejectedValueOnce(new Error('Temporary outage')).mockResolvedValueOnce(response());
    const { result } = renderHook(() => usePublicAvailability(selection));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.data).toBeNull(); act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });
  it('invalidates a selected slot when a refreshed quote is full and keeps other choices', async () => {
    bookingsService.slots.mockResolvedValueOnce(response()).mockResolvedValue(response(selection.date, 'full'));
    render(<MemoryRouter><GuestAvailability room={room} initialDraft={{ ...selection, serviceDate: selection.date, timeIn: '10:00' }} onContinue={() => {}} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in to reserve' }).disabled).toBe(false));
    expect(screen.getByText(/applies to every guest/)).toBeTruthy(); expect(screen.getByText(/Operating hours:.*next day/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Duration'), { target: { value: '2' } });
    await waitFor(() => expect(screen.getByText(/Your selected start time is no longer available/)).toBeTruthy());
    expect(screen.getByLabelText('Guests').value).toBe('1'); expect(screen.getByLabelText('Date').value).toBe(selection.date);
    expect(screen.getByRole('button', { name: 'Sign in to reserve' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: '10:00 AM, Full' }).disabled).toBe(true);
  });
});

describe('temporary reservation holds', () => {
  it('releases an unpaid hold once when the customer backs out', async () => {
    bookingsService.lockSlot.mockResolvedValue({ id: 'temporary', expiresAt: '2099-01-02T00:00:00Z' });
    bookingsService.releaseLock.mockResolvedValue({});
    const external = { current: false };
    const { result, unmount } = renderHook(() => useBookingHold(external));
    await act(async () => result.current.acquireHold(selection));
    expect(result.current.lock.id).toBe('temporary');
    expect(result.current.lock.observedAtMs).toBeGreaterThan(0);
    await act(async () => result.current.releaseCurrentLock());
    expect(result.current.lock).toBeNull();
    expect(bookingsService.releaseLock).toHaveBeenCalledWith('temporary');
    unmount();
    expect(bookingsService.releaseLock).toHaveBeenCalledTimes(1);
  });
  it('releases a late hold response when the customer already cancelled', async () => {
    const request = deferred();
    bookingsService.lockSlot.mockReturnValue(request.promise);
    bookingsService.releaseLock.mockResolvedValue({});
    const external = { current: false };
    const { result } = renderHook(() => useBookingHold(external));
    let acquiring;
    act(() => { acquiring = result.current.acquireHold(selection); });
    await act(async () => result.current.releaseCurrentLock());
    await act(async () => { request.resolve({ id: 'late', expiresAt: '2099-01-02T00:00:00Z' }); await acquiring; });
    expect(await acquiring).toBeNull();
    expect(result.current.lock).toBeNull();
    expect(bookingsService.releaseLock).toHaveBeenCalledWith('late');
  });
  it('preserves inventory while an external payment is unresolved', async () => {
    bookingsService.lockSlot.mockResolvedValue({ id: 'processing', expiresAt: '2099-01-02T00:00:00Z' });
    const external = { current: false };
    const { result, unmount } = renderHook(() => useBookingHold(external));
    await act(async () => result.current.acquireHold(selection));
    external.current = true;
    unmount();
    expect(bookingsService.releaseLock).not.toHaveBeenCalled();
  });
});

describe('payment status recovery', () => {
  it('resumes a verified original checkout without clearing its identity or starting a new intent', async () => {
    const resume = { checkout: { paymentIntentId: 'pi_original' }, hold: { id: 'original' } }, onResumeCheckout = vi.fn(() => true);
    paymentsService.attemptStatus.mockResolvedValue({ status: 'awaiting_payment_method', resume });
    sessionStorage.setItem('riverview_checkout_attempt', 'preserved');
    const { result } = renderHook(() => usePaymentPolling({ setResult: vi.fn(), setStep: vi.fn(), invalidateSession: vi.fn(), onResumeCheckout }));
    await act(async () => result.current.pollPayment('attempt', { attempt: true, maxChecks: 1 }));
    expect(onResumeCheckout).toHaveBeenCalledWith(resume);
    expect(paymentsService.attemptStatus).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('riverview_checkout_attempt')).toBe('preserved');
  });
  it('ignores an aborted old verification and clears checkout identity only on confirmed success', async () => {
    const first = deferred(), second = deferred(); const setResult = vi.fn();
    paymentsService.attemptStatus.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    bookingsService.get.mockResolvedValue({ _id: 'booking-new', status: 'Confirmed' });
    sessionStorage.setItem('riverview_checkout_attempt', 'preserved');
    const { result } = renderHook(() => usePaymentPolling({ setResult, setStep: () => {}, invalidateSession: () => {} }));
    act(() => result.current.pollPayment('old', { attempt: true, maxChecks: 1 }));
    act(() => result.current.pollPayment('new', { attempt: true, maxChecks: 1 }));
    await act(async () => second.resolve({ status: 'succeeded', bookingId: 'booking-new' }));
    await act(async () => first.resolve({ status: 'paid_slot_unavailable', message: 'Old response' }));
    expect(setResult.mock.lastCall[0].phase).toBe('confirmed'); expect(sessionStorage.getItem('riverview_checkout_attempt')).toBeNull();
  });
  it('network uncertainty preserves the original attempt and asks for a status check', async () => {
    const setResult = vi.fn(); paymentsService.attemptStatus.mockRejectedValue(new Error('Network lost'));
    sessionStorage.setItem('riverview_checkout_attempt', 'preserved');
    const { result } = renderHook(() => usePaymentPolling({ setResult, setStep: () => {}, invalidateSession: () => {} }));
    await act(async () => result.current.pollPayment('attempt', { attempt: true, maxChecks: 1 }));
    expect(setResult.mock.lastCall[0].phase).toBe('pending'); expect(setResult.mock.lastCall[0].message).toMatch(/do not pay again/);
    expect(sessionStorage.getItem('riverview_checkout_attempt')).toBe('preserved');
  });
});


const checkoutProps = () => ({
  attemptId: null, cardCvc: '', cardExpiry: '', cardNumber: '', checkOriginalPayment: vi.fn(),
  claimDiscount: false, contactMessengerUrl: '', contactPhone: '', depositBalanceCopy: '',
  downPaymentAmount: 120, handleConfirmWalletPay: vi.fn(), handleDemoPay: vi.fn(),
  handlePayCard: vi.fn(), handleRetryPayment: vi.fn(), handleSelectMethod: vi.fn(),
  payError: '', payErrorKind: '', payLoading: false, paymentChoice: 'deposit',
  pmIntent: { gateway: 'demo' }, priceBreakdown: { eligibleDiscount: 0, hourlyRates: [120] },
  selectedDuration: 1, selectedMethod: null, setCardCvc: vi.fn(), setCardExpiry: vi.fn(),
  setCardNumber: vi.fn(), setPaymentChoice: vi.fn(), visiblePaymentMethods: [],
  visiblePaymentOptions: [{ choice: 'deposit', label: '1 hour', amount: 120 }],
});

describe('checkout presentation', () => {
  it('offers one demo payment action and prevents a second submission while processing', () => {
    const props = checkoutProps();
    const { rerender } = render(<CheckoutStep {...props} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Simulate successful payment' }));
    expect(props.handleDemoPay).toHaveBeenCalledTimes(1);
    rerender(<CheckoutStep {...props} payLoading />);
    fireEvent.click(screen.getByRole('button', { name: 'Processing…' }));
    expect(props.handleDemoPay).toHaveBeenCalledTimes(1);
  });
  it('associates real card inputs with their labels and keeps the payment amount fixed once checkout starts', () => {
    render(<CheckoutStep {...checkoutProps()} pmIntent={{ gateway: 'paymongo' }} selectedMethod="card" attemptId="original"
      visiblePaymentOptions={[{ choice: 'deposit', label: 'Deposit', amount: 120 }, { choice: 'full', label: 'Full payment', amount: 240 }]} />);
    expect(screen.getByLabelText('Card number').getAttribute('autocomplete')).toBe('cc-number');
    expect(screen.getByLabelText('Expiry (MM/YY)').getAttribute('autocomplete')).toBe('cc-exp');
    expect(screen.getByLabelText('CVC').getAttribute('autocomplete')).toBe('cc-csc');
    expect(screen.getByRole('button', { name: /Deposit/ }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: /Full payment/ }).disabled).toBe(true);
  });
  it('keeps an unconfirmed payment actionable without promising a reservation', () => {
    const check = vi.fn();
    render(<PaymentVerificationStep pmReturn={{ phase: 'pending', reference: 'rv-original' }} handleDone={() => {}} handleRetryFromReturn={check} />);
    expect(screen.getByText(/We have not confirmed a reservation yet/)).toBeTruthy();
    expect(screen.getByText('rv-original')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Check payment status' }));
    expect(check).toHaveBeenCalledTimes(1);
  });
  it('shows the original reference and venue contact when payment was received without a reservation', () => {
    const { rerender } = render(<MemoryRouter><PaymentVerificationStep pmReturn={{ phase: 'paidSlotUnavailable', reference: 'rv-original' }} handleDone={() => {}} contactPhone="09170000001" /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Payment received, reservation not confirmed' })).toBeTruthy();
    expect(screen.getByText('rv-original')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Call the venue' }).getAttribute('href')).toBe('tel:09170000001');
    expect(screen.queryByRole('button', { name: /pay again/i })).toBeNull();
    rerender(<MemoryRouter><PaymentVerificationStep pmReturn={{ phase: 'paidSlotUnavailable', reference: 'rv-original' }} handleDone={() => {}} /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Contact the venue' }).getAttribute('href')).toBe('/contact');
  });
});
