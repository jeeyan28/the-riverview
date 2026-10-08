import { FacilitySelectionStep, ScheduleStep, GuestDetailsStep } from './booking/BookingSelectionSteps';
import { CheckoutStep } from './booking/BookingPaymentSteps';
import { PaymentVerificationStep } from './booking/PaymentVerificationStep';
import { useEffect, useReducer, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBookingAvailability } from '../hooks/useBookingAvailability';
import { useBookingHold } from '../hooks/useBookingHold';
import { useCheckoutAttempt, readCheckoutAttempt } from '../hooks/useCheckoutAttempt';
import { usePaymentPolling } from '../hooks/usePaymentPolling';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { bookingFlowReducer, initialBookingFlow } from '../utils/bookingFlow';
import { clearReservationDraft, clearCheckoutState } from '../utils/reservationDraft';
import { bookingsService } from '../services/bookings';
import { paymentsService } from '../services/payments';
import { useToast } from '../hooks/useToast';
import { formatHour } from '../utils/receipt';
import { dateKey, getPaxCapacity, clearReservedHours, clearMonthAvailability, isHolidayDate, holidayReason, isOperatingDay, priceOptionsFor, getSlotState, getDayAvailability } from '../utils/rooms';
import { calculateBookingPrice, effectiveDiscountPercent, variantRateLabel } from '../utils/roomPricing';
import { terminalPaymentFailure } from '../utils/paymongoStatus';
import { reservationNameParts } from '../utils/reservationName';
import { ArrowLeft, Clock3, X } from 'lucide-react';
import ModalPortal from './ModalPortal';
import Toast from './Toast';
import { businessDate } from '../utils/businessDate';
import { slotBookingFields, slotStartMs } from '../utils/bookingHours';
import { BookingStepper, BookingSummaryContents, MONTHS, STEPS, PAYMENT_METHODS } from './booking/BookingPresentation';
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const STEP_INDEX = {
  price: 1,
  schedule: 2,
  details: 3,
  payment: 4
};
function BookingModal({
  room,
  returnInfo,
  onClose,
  openHour,
  closeHour,
  settings,
  initialVariantLabel = '',
  initialDraft = null
}) {
  const open = !!room || !!returnInfo;
  const {
    user: authUser,
    revalidate,
    verifySession,
    sessionVerified,
    invalidateSession
  } = useAuth();
  const {
    toast,
    showToast
  } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [flow, dispatchFlow] = useReducer(bookingFlowReducer, initialBookingFlow);
  const step = flow.step;
  const setStep = key => dispatchFlow({
    type: key === 'paymongoReturn' ? 'RETURN' : 'STEP',
    step: key
  });
  const dialogRef = useRef(null);
  const draftAcquiredRef = useRef(false);
  useDialogFocus(open, dialogRef, handleClose);
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => new Date(`${businessDate()}T12:00:00`));
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [selectedHour, setSelectedHour] = useState(null);
  const totalRooms = Number(selectedVariant?.roomCount) || 1;
  const minDuration = Number.isFinite(Number(settings?.operatingHours?.minOnlineDurationHours)) ? Number(settings.operatingHours.minOnlineDurationHours) : 1;
  const maxDuration = Number.isFinite(Number(settings?.operatingHours?.maxOnlineDurationHours)) ? Number(settings.operatingHours.maxOnlineDurationHours) : 5;
  const [selectedDuration, setSelectedDuration] = useState(minDuration);
  const [paymentChoice, setPaymentChoice] = useState('deposit');
  const [claimDiscount, setClaimDiscount] = useState(false);
  const [selectedAddOns, setSelectedAddOns] = useState([]);
  const [guestLastName, setGuestLastName] = useState('');
  const [guestFirstName, setGuestFirstName] = useState('');
  const guestName = [guestLastName.trim(), guestFirstName.trim()].filter(Boolean).join(', ');
  const [guestContact, setGuestContact] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestCount, setGuestCount] = useState(1);
  const [guestNote, setGuestNote] = useState('');
  const [paxError, setPaxError] = useState('');
  const [lastNameError, setLastNameError] = useState('');
  const [firstNameError, setFirstNameError] = useState('');
  const [contactError, setContactError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState('');
  const [payErrorKind, setPayErrorKind] = useState(null);
  const [paymentInitVersion, setPaymentInitVersion] = useState(0);
  const [paymongoPublicKey, setPaymongoPublicKey] = useState('');
  const [allowedPaymentMethodKeys, setAllowedPaymentMethodKeys] = useState(null);
  const [pmIntent, setPmIntent] = useState(null);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const openingUser = useRef(authUser);
  openingUser.current = authUser;
  const publicKey = useRef(paymongoPublicKey);
  publicKey.current = paymongoPublicKey;
  const continueSchedule = useRef(null);
  continueSchedule.current = handleContinueFromSchedule;
  const paymentInitRef = useRef(null);
  const resumedCheckout = useRef(null);
  const paymentActionRef = useRef(null);
  const externalCheckoutRef = useRef(false);
  const [pmReturn, setPmReturn] = useState({
    phase: 'loading',
    booking: null
  });
  const {
    attemptId,
    prepareCheckout,
    restoreCheckout,
    recoverAttempt
  } = useCheckoutAttempt();
  const {
    pollPayment,
    stopPolling
  } = usePaymentPolling({
    setStep,
    setResult: setPmReturn,
    invalidateSession,
    onResumeCheckout: resumeOriginalCheckout
  });
  const {
    lock,
    setLock,
    lockRef,
    lockNow,
    lockLoading,
    releaseCurrentLock,
    acquireHold
  } = useBookingHold(externalCheckoutRef);
  const [lockError, setLockError] = useState('');
  const {
    monthBookings,
    reserved,
    calendarLoading,
    slotsLoading,
    availabilityError,
    retryAvailability
  } = useBookingAvailability({
    enabled: step === 'schedule',
    roomId: room?._id,
    variantLabel: selectedVariant?.label,
    viewDate,
    selectedDate
  });
  useEffect(() => {
    if (step !== 'paymongoReturn') return;
    const phase = {
      loading: 'verifying',
      confirmed: 'confirmed',
      paidSlotUnavailable: 'payment_problem',
      failed: 'failed',
      expired: 'expired',
      pending: 'awaiting_payment'
    }[pmReturn.phase];
    if (phase) dispatchFlow({
      type: 'PHASE',
      phase
    });
    if (pmReturn.phase === 'confirmed') {
      clearReservationDraft();
      clearCheckoutState();
      setCardNumber('');
      setCardCvc('');
      setCardExpiry('');
    }
  }, [step, pmReturn.phase]);
  useEffect(() => {
    if (step === 'paymongoReturn' && pmReturn.phase === 'confirmed') {
      showToast('Reservation successful! Download your receipt or view it in Profile → Reservations.');
    }
  }, [step, pmReturn.phase, showToast]);
  useEffect(() => {
    if (!room) return;
    const roomOptions = priceOptionsFor(room);
    const initialVariant = initialVariantLabel ? roomOptions.find(option => option.label === initialVariantLabel) || null : roomOptions.length === 1 ? roomOptions[0] : null;
    dispatchFlow({
      type: 'RESET',
      step: initialVariant ? 'schedule' : 'price'
    });
    draftAcquiredRef.current = false;
    setMobileSummaryOpen(false);
    setViewDate(new Date(`${businessDate()}T12:00:00`));
    setSelectedDate(null);
    setSelectedVariant(initialVariant);
    setSelectedHour(null);
    setSelectedDuration(minDuration);
    setGuestNote('');
    setClaimDiscount(false);
    setSelectedAddOns([]);
    setPaymentChoice('deposit');
    setGuestCount(1);
    setPaxError('');
    setLastNameError('');
    setFirstNameError('');
    setContactError('');
    setEmailError('');
    setPmIntent(null);
    resumedCheckout.current = null;
    externalCheckoutRef.current = false;
    setSelectedMethod(null);
    setCardNumber('');
    setCardExpiry('');
    setCardCvc('');
    setPayError('');
    setPayErrorKind(null);
    setPayLoading(false);
    stopPolling();
    stopPaymentAction();
    releaseCurrentLock();
    setLockError('');
    const user = openingUser.current;
    setGuestLastName(user?.lastName || '');
    setGuestFirstName(user?.firstName || '');
    setGuestContact(user?.phone || '');
    setGuestEmail(user?.email || '');
    const previousCheckout = readCheckoutAttempt();
    if (previousCheckout) {
      externalCheckoutRef.current = true;
      pollPayment(previousCheckout.attemptId || previousCheckout.clientKey, {
        attempt: true,
        maxChecks: 12
      });
      return;
    }
    if (initialDraft?.roomId === room._id && initialVariant) {
      const [y, month, d] = initialDraft.serviceDate.split('-').map(Number);
      setSelectedDate({
        y,
        m: month - 1,
        d
      });
      setViewDate(new Date(initialDraft.serviceDate + 'T12:00:00'));
      setSelectedHour(Number(initialDraft.timeIn.slice(0, 2)) + (initialDraft.date > initialDraft.serviceDate ? 24 : 0));
      setSelectedDuration(initialDraft.duration);
      setGuestCount(initialDraft.guestCount);
      setPaymentChoice(initialDraft.paymentChoice);
    }
  }, [room, initialVariantLabel, initialDraft, minDuration, pollPayment, releaseCurrentLock, stopPolling]);
  useEffect(() => {
    if (!room || !authUser || !sessionVerified || !initialDraft || draftAcquiredRef.current || step !== 'schedule' || slotsLoading || availabilityError || selectedHour === null) return;
    draftAcquiredRef.current = true;
    continueSchedule.current();
  }, [room, authUser, sessionVerified, initialDraft, step, slotsLoading, availabilityError, selectedHour]);
  useEffect(() => {
    if (!returnInfo) return undefined;
    pollPayment(returnInfo.provider === 'xendit' ? returnInfo.referenceId : returnInfo.paymentIntentId, {
      provider: returnInfo.provider,
      maxChecks: 12
    });
    return stopPolling;
  }, [returnInfo, pollPayment, stopPolling]);
  useEffect(() => {
    if (!lock) return;
    if (lockNow < lock.expiresAtMs) return;
    setLock(null);
    lockRef.current = null;
    if (externalCheckoutRef.current) {
      setStep('paymongoReturn');
      setPmReturn({
        phase: 'pending',
        booking: null
      });
      return;
    }
    dispatchFlow({
      type: 'PHASE',
      phase: 'expired'
    });
    setSelectedHour(null);
    setLockError('Your hold on this time slot expired. Please pick a time again.');
    if (STEP_INDEX[step] > STEP_INDEX.schedule) setStep('schedule');
    if (room && selectedDate) {
      const key = dateKey(selectedDate.y, selectedDate.m, selectedDate.d);
      clearReservedHours(room._id, key);
      retryAvailability();
    }
  }, [lockNow, lock, lockRef, room, selectedDate, setLock, step, retryAvailability]);
  useEffect(() => {
    if (!room) return;
    const cap = getPaxCapacity(selectedVariant?.pax);
    let message = '';
    if (!Number.isFinite(guestCount) || guestCount < 1) {
      message = 'Please enter at least 1 guest.';
    } else if (cap && guestCount > cap) {
      message = `This room accommodates up to ${cap} guest(s). Please reduce your pax or choose a bigger room.`;
    }
    setPaxError(message);
  }, [room, selectedVariant, guestCount]);
  useEffect(() => {
    if (step !== 'payment' || !sessionVerified || !room || !selectedVariant || !selectedDate || selectedHour === null) return;
    if (resumedCheckout.current) return;
    let cancelled = false;
    const controller = new AbortController();
    paymentInitRef.current = controller;
    const isCurrent = () => !cancelled && !controller.signal.aborted && paymentInitRef.current === controller;
    async function init() {
      setPmIntent(null);
      setSelectedMethod(null);
      setPayError('');
      setPayErrorKind(null);
      setPayLoading(true);
      try {
        if (!publicKey.current) {
          try {
            const cfg = await paymentsService.config({
              signal: controller.signal
            });
            if (!isCurrent()) return;
            if (cfg.publicKey) setPaymongoPublicKey(cfg.publicKey);
            if (Array.isArray(cfg.paymentMethods)) setAllowedPaymentMethodKeys(cfg.paymentMethods);
          } catch (err) {
            if (!isCurrent()) return;
            console.error(err);
          }
        }
        if (!isCurrent()) return;
        const {
          y,
          m,
          d
        } = selectedDate;
        const serviceDate = dateKey(y, m, d);
        const {
          date: dateStr,
          timeIn: timeStr
        } = slotBookingFields(serviceDate, selectedHour);
        const data = await prepareCheckout(lockRef.current?.id, {
          guestName: guestName.trim(),
          guestContact: guestContact.trim(),
          guestEmail: guestEmail.trim(),
          guestCount: guestCount || 1,
          specialRequests: guestNote.trim(),
          roomId: room._id,
          variantLabel: selectedVariant.label,
          date: dateStr,
          timeIn: timeStr,
          duration: selectedDuration,
          paymentChoice: selectedDuration === 1 ? 'deposit' : paymentChoice,
          claimDiscount,
          selectedAddOns
        }, {
          signal: controller.signal
        });
        if (!isCurrent()) return;
        clearReservedHours(room._id, serviceDate);
        clearMonthAvailability(room._id, y, m + 1);
        if (dateStr !== serviceDate) {
          const [bookingYear, bookingMonth] = dateStr.split('-').map(Number);
          clearMonthAvailability(room._id, bookingYear, bookingMonth);
        }
        if (data.status === 'checking') {
          externalCheckoutRef.current = true;
          setPayErrorKind('checking');
          setPayError(data.message || 'We are checking your payment. Please do not pay again.');
          dispatchFlow({
            type: 'PHASE',
            phase: 'awaiting_payment'
          });
          return;
        }
        if (data.gateway === 'demo') {
          setPmIntent(data);
          return;
        }
        if (data.gateway === 'xendit') {
          externalCheckoutRef.current = true;
          setPmIntent({
            gateway: 'xendit',
            amount: data.amount
          });
          window.location.assign(data.redirectUrl);
          return;
        }
        dispatchFlow({
          type: 'PHASE',
          phase: 'awaiting_payment'
        });
        setPmIntent({
          paymentIntentId: data.paymentIntentId,
          clientKey: data.clientKey,
          amount: data.amount
        });
      } catch (err) {
        if (isCurrent()) {
          if (err.status === 401) {
            invalidateSession();
            alert('Your session has expired. Please log in again to complete your reservation.');
            window.location.href = '/login';
            return;
          }
          console.error(err);
          setPayErrorKind([400, 403, 409, 410, 503].includes(err.status) ? 'connectivity' : 'checking');
          if (![400, 403, 409, 410, 503].includes(err.status)) externalCheckoutRef.current = true;
          setPayError(err.message || 'We are checking your payment. Check the original attempt before another payment.');
        }
      } finally {
        if (isCurrent()) setPayLoading(false);
      }
    }
    init();
    return () => {
      cancelled = true;
      controller.abort();
      if (paymentInitRef.current === controller) paymentInitRef.current = null;
    };
  }, [step, sessionVerified, room, selectedVariant, selectedDate, selectedHour, selectedDuration, paymentChoice, claimDiscount, selectedAddOns, paymentInitVersion, invalidateSession, prepareCheckout, guestContact, guestCount, guestEmail, guestName, guestNote, lockRef]);
  function resumeOriginalCheckout({ draft, hold, checkout }) {
    if (!room || draft.roomId !== room._id) return false;
    const variant = priceOptionsFor(room).find(option => option.label === draft.variantLabel);
    if (!variant) return false;
    const [y, month, d] = draft.serviceDate.split('-').map(Number);
    const name = reservationNameParts(draft.guestName);
    resumedCheckout.current = checkout;
    externalCheckoutRef.current = false;
    restoreCheckout(checkout);
    setSelectedVariant(variant);
    setSelectedDate({ y, m: month - 1, d });
    setSelectedHour(Number(draft.timeIn.slice(0, 2)) + (draft.date > draft.serviceDate ? 24 : 0));
    setSelectedDuration(draft.duration);
    setGuestCount(draft.guestCount);
    setGuestLastName(name.lastName);
    setGuestFirstName(name.firstName);
    setGuestContact(draft.guestContact || '');
    setGuestEmail(draft.guestEmail || '');
    setGuestNote(draft.specialRequests || '');
    setPaymentChoice(draft.paymentChoice);
    setClaimDiscount(draft.claimDiscount);
    setSelectedAddOns(draft.selectedAddOns);
    setLock({ id: hold.id, expiresAtMs: new Date(hold.expiresAt).getTime() });
    setPmIntent(checkout);
    if (checkout.publicKey) setPaymongoPublicKey(checkout.publicKey);
    if (checkout.paymentMethods) setAllowedPaymentMethodKeys(checkout.paymentMethods);
    setPayLoading(false);
    setPayError('');
    setPayErrorKind(null);
    dispatchFlow({ type: 'RESUME_CHECKOUT' });
    return true;
  }
  function handleClose() {
    stopPolling();
    stopPaymentAction();
    releaseCurrentLock();
    if (!externalCheckoutRef.current) {
      clearReservationDraft();
      clearCheckoutState();
    }
    setCardNumber('');
    setCardCvc('');
    setCardExpiry('');
    onClose();
  }
  function handleChooseOption(opt) {
    setSelectedVariant(opt);
    setSelectedAddOns([]);
    setClaimDiscount(false);
    setViewDate(new Date(`${businessDate()}T12:00:00`));
    setStep('schedule');
  }
  async function handleStepClick(targetKey) {
    const targetIndex = STEP_INDEX[targetKey] || 1;
    const currentIndex = STEP_INDEX[step] || 1;
    if (targetIndex >= currentIndex || externalCheckoutRef.current || attemptId && step === 'payment') return;
    if (targetKey === 'price' || targetKey === 'schedule') await releaseCurrentLock();
    if (targetKey === 'price') {
      setLockError('');
      setSelectedDate(null);
      setSelectedHour(null);
    }
    setStep(targetKey);
  }
  function handleSelectDate(y, m, d) {
    releaseCurrentLock();
    setLockError('');
    setSelectedDate({
      y,
      m,
      d
    });
    setSelectedHour(null);
  }
  function handleChangeDate() {
    releaseCurrentLock();
    setLockError('');
    setSelectedDate(null);
    setSelectedHour(null);
  }
  function handlePaxStep(delta) {
    const cap = getPaxCapacity(selectedVariant?.pax);
    setGuestCount(v => {
      let next = (Number.isFinite(v) ? v : 1) + delta;
      next = Math.max(1, next);
      if (cap) next = Math.min(next, cap);
      return next;
    });
  }
  function handleSelectDuration(dur) {
    releaseCurrentLock();
    setLockError('');
    setSelectedDuration(dur);
    if (dur === 1) setPaymentChoice('deposit');
    setSelectedHour(null);
  }
  function handleSelectHour(hour) {
    const state = getSlotState(hour, selectedDuration, closeHour, reserved, totalRooms);
    if (state !== 'available') return;
    setLockError('');
    if (hour === selectedHour) return;
    releaseCurrentLock();
    setSelectedHour(hour);
  }
  async function handleContinueFromSchedule() {
    if (selectedHour === null || lockLoading || !sessionVerified || availabilityError || slotsLoading) return;
    const state = getSlotState(selectedHour, selectedDuration, closeHour, reserved, totalRooms);
    if (state !== 'available') {
      setSelectedHour(null);
      setLockError('That start time is no longer available. Choose another time.');
      return;
    }
    const currentLock = lockRef.current;
    if (currentLock && currentLock.expiresAtMs > Date.now()) {
      setStep('details');
      return;
    }
    setLockError('');
    dispatchFlow({
      type: 'PHASE',
      phase: 'acquiring_hold'
    });
    try {
      const {
        y,
        m,
        d
      } = selectedDate;
      const {
        date,
        timeIn
      } = slotBookingFields(dateKey(y, m, d), selectedHour);
      const hold = await acquireHold({
        roomId: room._id,
        variantLabel: selectedVariant?.label,
        date,
        timeIn,
        duration: selectedDuration
      });
      dispatchFlow({
        type: 'PHASE',
        phase: 'selecting'
      });
      if (hold) setStep('details');
    } catch (error) {
      dispatchFlow({
        type: 'PHASE',
        phase: 'selecting'
      });
      if (error.status === 409) {
        setSelectedHour(null);
        retryAvailability();
      }
      setLockError(error.message || 'We could not hold this time. Please retry.');
    }
  }
  async function continueToPayment() {
    const trimmedLastName = guestLastName.trim();
    const trimmedFirstName = guestFirstName.trim();
    const trimmedContact = guestContact.trim();
    const trimmedEmail = guestEmail.trim();
    const lastErr = !trimmedLastName ? 'Please enter your last name.' : guestName.length > 120 ? 'Keep the full name within 120 characters.' : '';
    const firstErr = trimmedFirstName ? '' : 'Please enter your first name.';
    const cErr = !trimmedContact ? 'Please enter a phone number.' : trimmedContact.length < 7 || trimmedContact.length > 40 || !/^\+?[0-9() .-]+$/.test(trimmedContact) || trimmedContact.replace(/\D/g, '').length < 7 ? 'Enter a valid phone number.' : '';
    const eErr = !trimmedEmail ? 'Please enter an email address.' : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail) ? 'Enter a valid email address.' : '';
    setLastNameError(lastErr);
    setFirstNameError(firstErr);
    setContactError(cErr);
    setEmailError(eErr);
    if (lastErr || firstErr || cErr || eErr || paxError) return;
    setConfirming(true);
    const verified = await verifySession();
    setConfirming(false);
    if (!verified) {
      setLockError('We could not verify your session. Retry the session check; your details are saved.');
      return;
    }
    setStep('payment');
  }
  async function handleBack() {
    if (paymentActionRef.current) return;
    if (externalCheckoutRef.current || attemptId && step === 'payment') {
      checkOriginalPayment();
      return;
    }
    if (step === 'payment') {
      setStep('details');
      return;
    }
    if (step === 'details') {
      await releaseCurrentLock();
      setStep('schedule');
      return;
    }
    if (step === 'schedule' && priceOptionsFor(room).length > 1 && !initialVariantLabel) {
      releaseCurrentLock();
      setSelectedDate(null);
      setSelectedHour(null);
      setStep('price');
      return;
    }
    handleClose();
  }
  function stopPaymentAction() {
    paymentInitRef.current?.abort();
    paymentInitRef.current = null;
    paymentActionRef.current?.abort();
    paymentActionRef.current = null;
  }
  function beginPaymentAction() {
    if (paymentActionRef.current) return null;
    const controller = new AbortController();
    paymentActionRef.current = controller;
    return controller;
  }
  useEffect(() => () => {
    stopPolling();
    stopPaymentAction();
  }, [stopPolling]);
  async function fetchPaidBooking(bookingId, options) {
    try {
      return await bookingsService.get(bookingId, options);
    } catch (err) {
      if (err.name !== 'AbortError') console.error(err);
    }
    return null;
  }
  function openPopupAndPoll(redirectUrl, paymentIntentId) {
    externalCheckoutRef.current = true;
    const popup = window.open(redirectUrl, 'paymongo_pay', 'width=480,height=760');
    if (!popup) {
      window.location.assign(redirectUrl);
      return;
    }
    pollPayment(paymentIntentId, {
      popup
    });
  }
  function pollStatusOnly(paymentIntentId) {
    externalCheckoutRef.current = true;
    pollPayment(paymentIntentId);
  }
  function checkOriginalPayment() {
    if (attemptId || recoverAttempt?.attemptId) pollPayment(attemptId || recoverAttempt.attemptId, {
      attempt: true,
      maxChecks: 12
    });else if (pmIntent?.paymentIntentId) pollStatusOnly(pmIntent.paymentIntentId);else if (recoverAttempt?.clientKey) pollPayment(recoverAttempt.clientKey, {
      attempt: true,
      maxChecks: 12
    });else setPaymentInitVersion(value => value + 1);
  }
  async function attachAndHandle(body, controller = beginPaymentAction()) {
    if (!controller || controller.signal.aborted) return;
    setPayError('');
    setPayErrorKind(null);
    setPayLoading(true);
    try {
      const {
        data,
        httpStatus
      } = await paymentsService.attach(pmIntent.paymentIntentId, body, {
        signal: controller.signal
      });
      if (controller.signal.aborted) return;
      if (data.status === 'succeeded') {
        const booking = await fetchPaidBooking(data.bookingId, {
          signal: controller.signal
        });
        if (controller.signal.aborted) return;
        setStep('paymongoReturn');
        setPmReturn({
          phase: 'confirmed',
          booking
        });
        return;
      }
      if (data.status === 'awaiting_next_action' && data.redirectUrl) {
        openPopupAndPoll(data.redirectUrl, pmIntent.paymentIntentId);
        return;
      }
      if (data.status === 'processing') {
        pollStatusOnly(pmIntent.paymentIntentId);
        return;
      }
      if (data.status === 'paid_slot_unavailable') {
        setPayErrorKind('paidSlotUnavailable');
        setPayError(data.message || 'Your payment succeeded, but this slot was just taken. Please contact support.');
        return;
      }
      const paymentFailure = terminalPaymentFailure(data, {
        httpStatus
      });
      if (paymentFailure) {
        setPayErrorKind(paymentFailure.phase === 'failed' ? 'declined' : paymentFailure.phase);
        setPayError(paymentFailure.message);
        return;
      }
      setPayErrorKind('declined');
      setPayError(data.message || 'That payment method was declined. Please try another.');
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err.status === 401) {
        invalidateSession();
        alert('Your session has expired. Please log in again to complete your reservation.');
        window.location.href = '/login';
        return;
      }
      if (err.status === 400 && err.field === 'guestEmail') {
        setPayErrorKind('declined');
        setPayError(err.message || 'A valid email is required for wallet payments. Please go back and enter your email.');
        return;
      }
      console.error(err);
      externalCheckoutRef.current = true;
      setPayErrorKind('checking');
      setPayError('We are checking your payment. Please do not pay again; check the original payment status.');
    } finally {
      if (paymentActionRef.current === controller) paymentActionRef.current = null;
      if (!controller.signal.aborted) setPayLoading(false);
    }
  }
  function handleSelectMethod(key) {
    if (!pmIntent || payLoading) return;
    setSelectedMethod(key);
    setPayError('');
    setPayErrorKind(null);
  }
  function handleConfirmWalletPay() {
    if (!pmIntent || payLoading || !selectedMethod || selectedMethod === 'card') return;
    attachAndHandle({
      paymentMethodType: selectedMethod
    });
  }
  async function handlePayCard(e) {
    e.preventDefault();
    if (!pmIntent || payLoading) return;
    const digits = cardNumber.replace(/\s+/g, '');
    const [mm, yyRaw] = cardExpiry.split('/').map(s => (s || '').trim());
    const yy = yyRaw && yyRaw.length === 2 ? `20${yyRaw}` : yyRaw;
    if (!digits || digits.length < 12 || !mm || !yy || !cardCvc) {
      setPayErrorKind('declined');
      setPayError('Please enter a valid card number, expiry (MM/YY), and CVC.');
      return;
    }
    if (!paymongoPublicKey) {
      setPayErrorKind('connectivity');
      setPayError('Payment is still initializing — please wait a moment and try again.');
      return;
    }
    const controller = beginPaymentAction();
    if (!controller) return;
    setPayError('');
    setPayErrorKind(null);
    setPayLoading(true);
    try {
      const paymentMethodId = await paymentsService.createCardMethod(paymongoPublicKey, {
        card_number: digits,
        exp_month: Number(mm),
        exp_year: Number(yy),
        cvc: cardCvc
      }, guestName, {
        signal: controller.signal
      });
      if (controller.signal.aborted) return;
      await attachAndHandle({
        paymentMethodId,
        paymentMethodType: 'card'
      }, controller);
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error(err);
      setPayErrorKind(err.status >= 400 && err.status < 500 ? 'declined' : 'connectivity');
      setPayError(err.message || 'Card could not be verified. Please check the details and try again.');
    } finally {
      if (paymentActionRef.current === controller) paymentActionRef.current = null;
      if (!controller.signal.aborted) setPayLoading(false);
    }
  }
  function handleRetryPayment() {
    if (externalCheckoutRef.current || attemptId) {
      checkOriginalPayment();
      return;
    }
    setPayError('');
    setPayErrorKind(null);
    setPmIntent(null);
    setSelectedMethod(null);
    setPaymentInitVersion(version => version + 1);
  }
  async function handleDemoPay() {
    setPayLoading(true);
    try {
      const data = await paymentsService.demoConfirm(pmIntent.attemptId);
      const booking = await fetchPaidBooking(data.bookingId);
      setStep('paymongoReturn');
      setPmReturn({
        phase: 'confirmed',
        booking
      });
    } catch (error) {
      setPayError(error.message);
    } finally {
      setPayLoading(false);
    }
  }
  function handleRetryFromReturn() {
    if (returnInfo) pollPayment(returnInfo.provider === 'xendit' ? returnInfo.referenceId : returnInfo.paymentIntentId, {
      provider: returnInfo.provider,
      maxChecks: 12
    });else checkOriginalPayment();
  }
  function handleDone() {
    stopPolling();
    stopPaymentAction();
    releaseCurrentLock();
    onClose();
  }
  function buildCalendarDays() {
    if (!room) return {
      firstDay: 0,
      days: []
    };
    const y = viewDate.getFullYear();
    const m = viewDate.getMonth();
    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const todayKey = businessDate();
    const days = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const thisDate = new Date(y, m, d);
      const dStr = dateKey(y, m, d);
      const isToday = dStr === todayKey;
      const holiday = isHolidayDate(dStr, settings?.holidays);
      const closedDay = !isOperatingDay(thisDate, settings?.operatingHours);
      const past = slotStartMs(dStr, closeHour) <= Date.now();
      const {
        availableStarts,
        nearlyFull
      } = getDayAvailability(monthBookings[dStr], openHour, closeHour, totalRooms, selectedDuration, dStr);
      const fullyBooked = availableStarts === 0;
      const unavailable = holiday || closedDay;
      const blocked = unavailable || fullyBooked;
      let variant = null;
      let title = '';
      if (!past) {
        if (unavailable) {
          variant = 'unavailable';
          title = holiday ? holidayReason(dStr, settings?.holidays) : 'Closed on this day of the week. No reservations are available on this date.';
        } else if (fullyBooked) {
          variant = 'full';
          title = 'Full — no rooms or start times left for this duration';
        } else if (nearlyFull) {
          variant = 'few';
          title = 'Nearly full — few rooms or start times left';
        } else {
          variant = 'available';
        }
      }
      days.push({
        d,
        y,
        m,
        isToday,
        disabled: past || blocked,
        variant,
        title,
        holiday: !past && holiday
      });
    }
    return {
      firstDay,
      days
    };
  }
  const priceItems = room ? priceOptionsFor(room) : [];
  const hasRoomChoice = priceItems.length > 1 && !initialVariantLabel;
  const visibleSteps = hasRoomChoice ? STEPS : STEPS.filter(item => item.key !== 'price');
  const {
    firstDay,
    days: calendarDays
  } = step === 'schedule' ? buildCalendarDays() : {
    firstDay: 0,
    days: []
  };
  const cap = getPaxCapacity(selectedVariant?.pax) || Number(room?.capacity) || null;
  const serviceDateKey = selectedDate ? dateKey(selectedDate.y, selectedDate.m, selectedDate.d) : null;
  const selectedBookingDateKey = serviceDateKey && selectedHour !== null ? slotBookingFields(serviceDateKey, selectedHour).date : serviceDateKey;
  const selectedBookingDate = selectedBookingDateKey ? new Date(`${selectedBookingDateKey}T12:00:00`) : null;
  const selectedDateLabel = selectedBookingDate ? `${WEEKDAYS[selectedBookingDate.getDay()]}, ${MONTHS[selectedBookingDate.getMonth()]} ${selectedBookingDate.getDate()}${selectedHour >= 24 ? ' (next day)' : ''}` : '';
  const selectedOptionLabel = selectedVariant ? `${selectedVariant.label} · ${variantRateLabel(selectedVariant)}` : '';
  const startTimeLabel = selectedHour !== null ? `${formatHour(selectedHour)}${selectedHour >= 24 ? ' next day' : ''}` : '—';
  const endTimeLabel = selectedHour !== null ? `${formatHour(selectedHour + selectedDuration)}${selectedHour + selectedDuration >= 24 ? ' next day' : ''}` : '—';
  const durationLabel = `${selectedDuration} hour${selectedDuration === 1 ? '' : 's'}`;
  const priceBreakdown = selectedVariant ? calculateBookingPrice({
    room,
    variant: selectedVariant,
    startHour: selectedHour ?? 0,
    duration: selectedDuration,
    guestCount,
    paymentChoice: selectedDuration === 1 ? 'deposit' : paymentChoice,
    claimDiscount,
    selectedAddOns
  }) : {
    amount: 0,
    roomCharge: 0,
    downPayment: 0,
    discountAmount: 0,
    eligibleDiscount: 0,
    addOns: [],
    addOnFee: 0,
    hourlyRates: []
  };
  const subtotalAmount = priceBreakdown.amount;
  const downPaymentAmount = priceBreakdown.downPayment;
  const remainingBalanceAmount = Math.max(0, subtotalAmount - downPaymentAmount);
  const depositBalanceCopy = remainingBalanceAmount > 0 ? priceBreakdown.eligibleDiscount > 0 ? `₱${remainingBalanceAmount.toLocaleString()} remains before that discount. ` : `₱${remainingBalanceAmount.toLocaleString()} remains to pay at the facility. ` : '';
  const downPaymentOptions = [{
    choice: 'deposit',
    label: selectedDuration === 1 ? '1-hour reservation payment' : '1-hour down payment',
    amount: Math.min(priceBreakdown.roomCharge + priceBreakdown.addOnFee, priceBreakdown.hourlyRates[0] || 0)
  }, {
    choice: 'full',
    label: 'Pay in full',
    amount: Math.max(0, priceBreakdown.roomCharge - priceBreakdown.eligibleDiscount + priceBreakdown.addOnFee)
  }];
  const visiblePaymentOptions = selectedDuration === 1 ? downPaymentOptions.slice(0, 1) : downPaymentOptions;
  const availableDiscountPercent = selectedVariant ? effectiveDiscountPercent(room, selectedVariant) : 0;
  const availableDiscountAmount = Math.round(priceBreakdown.roomCharge * availableDiscountPercent) / 100;
  const visiblePaymentMethods = allowedPaymentMethodKeys ? PAYMENT_METHODS.filter(m => allowedPaymentMethodKeys.includes(m.key)) : PAYMENT_METHODS;
  const showSummaryPanel = room && step !== 'paymongoReturn' && step !== 'price';
  const contactMessengerUrl = settings?.contact?.messengerUrl;
  const contactPhone = settings?.contact?.phone;
  const isPaymentReturn = step === 'paymongoReturn';
  const isConfirmedReturn = isPaymentReturn && pmReturn.phase === 'confirmed';
  return <ModalPortal>
      <div className={`bk-overlay${open ? ' open' : ''}`} id="booking-modal" ref={dialogRef} tabIndex={-1} data-flow-phase={flow.phase} role="dialog" aria-modal="true" aria-labelledby="booking-modal-title">
        <div className={'bk-modal' + (showSummaryPanel ? '' : ' bk-modal--compact') + (isPaymentReturn ? ' bk-modal--payment-return' : '') + (isConfirmedReturn ? ' bk-modal--payment-confirmed' : '') + (isPaymentReturn && pmReturn.phase === 'loading' ? ' bk-modal--payment-loading' : '')}>
          <div className={`bk-header${isConfirmedReturn ? ' bk-header--success' : ''}`}>
          {!isConfirmedReturn && <button type="button" className="bk-modal-back" aria-label="Go back" onClick={handleBack} disabled={payLoading && Boolean(paymentActionRef.current)}>
            <ArrowLeft size={18} aria-hidden="true" />
            <span>Back</span>
          </button>}
          <div className="bk-header-identity">
            <div>
              <h2 id="booking-modal-title">{isConfirmedReturn ? 'Your reservation' : isPaymentReturn ? 'Online payment' : room?.name}</h2>
            </div>
          </div>
          <button type="button" className="bk-close" aria-label="Close reservation" onClick={handleClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {!sessionVerified && authUser && <p className="bk-lock-error" role="status">We could not verify your session. <button type="button" onClick={revalidate}>Retry session check</button></p>}
        {step !== 'paymongoReturn' && <BookingStepper step={step} onStepClick={handleStepClick} steps={visibleSteps} />}

        {lock && step !== 'price' && step !== 'paymongoReturn' && (() => {
          const remainingMs = Math.max(0, lock.expiresAtMs - Math.max(lockNow, lock.observedAtMs));
          const mm = String(Math.floor(remainingMs / 60000)).padStart(2, '0');
          const ss = String(Math.floor(remainingMs % 60000 / 1000)).padStart(2, '0');
          return <div className="bk-lock-banner">
              <Clock3 size={18} aria-hidden="true" />
              <div className="bk-hold-copy">
                <div className="bk-hold-heading"><strong>Temporary hold</strong><span className="bk-hold-timer" aria-label={'Time remaining: ' + mm + ' minutes ' + ss + ' seconds'}>{mm}:{ss}</span></div>
                <p>{externalCheckoutRef.current ? 'Payment is in progress. Check its status before paying again.' : 'No payment or reservation yet. Back to hours or Cancel releases this time.'}</p>
              </div>
            </div>;
        })()}

        {showSummaryPanel && <button type="button" className={`bk-summary-toggle${mobileSummaryOpen ? ' bk-summary-toggle--open' : ''}`} onClick={() => setMobileSummaryOpen(v => !v)} aria-expanded={mobileSummaryOpen}>
            <span>
              Your selection
              {selectedVariant && <span className="bk-summary-toggle-price"> · ₱{subtotalAmount.toLocaleString()}</span>}
            </span>
            <i className="fa-solid fa-chevron-down bk-summary-toggle-chevron"></i>
          </button>}

        {showSummaryPanel && mobileSummaryOpen && <div className="bk-summary-panel-mobile" aria-live="polite">
            <BookingSummaryContents room={room} selectedVariant={selectedVariant} selectedDate={selectedDate} selectedHour={selectedHour} selectedDuration={selectedDuration} guestName={guestName} guestContact={guestContact} guestEmail={guestEmail} guestCount={guestCount} guestNote={guestNote} selectedMethod={selectedMethod} subtotal={subtotalAmount} downPayment={downPaymentAmount} remainingBalance={remainingBalanceAmount} priceBreakdown={priceBreakdown} paymentChoice={paymentChoice} step={step} />
          </div>}

        <div className={'bk-content' + (isPaymentReturn ? ' bk-content--payment-return' : '') + (isConfirmedReturn ? ' bk-content--payment-confirmed' : '') + (isPaymentReturn && pmReturn.phase === 'loading' ? ' bk-content--payment-loading' : '')}>
          <div className="bk-body" inert={!sessionVerified && step !== 'paymongoReturn' ? '' : undefined}>
            {availabilityError && step === 'schedule' && <p role="alert">{availabilityError} <button type="button" onClick={retryAvailability}>Retry availability</button></p>}
            {lockError && step === 'details' && <p className="bk-lock-error" role="alert">{lockError}</p>}
            {step === 'price' && room && <FacilitySelectionStep handleChooseOption={handleChooseOption} priceItems={priceItems} room={room} selectedVariant={selectedVariant} />}

            {step === 'schedule' && room && selectedVariant && <ScheduleStep availabilityError={availabilityError} calendarDays={calendarDays} calendarLoading={calendarLoading} closeHour={closeHour} durationLabel={durationLabel} endTimeLabel={endTimeLabel} firstDay={firstDay} handleChangeDate={handleChangeDate} handleContinueFromSchedule={handleContinueFromSchedule} handleSelectDate={handleSelectDate} handleSelectDuration={handleSelectDuration} handleSelectHour={handleSelectHour} lockError={lockError} lockLoading={lockLoading} maxDuration={maxDuration} minDuration={minDuration} openHour={openHour} reserved={reserved} selectedDate={selectedDate} selectedDateLabel={selectedDateLabel} selectedDuration={selectedDuration} selectedHour={selectedHour} selectedOptionLabel={selectedOptionLabel} setViewDate={setViewDate} slotsLoading={slotsLoading} startTimeLabel={startTimeLabel} totalRooms={totalRooms} viewDate={viewDate} />}

            {step === 'details' && room && selectedVariant && selectedDate && selectedHour !== null && <GuestDetailsStep availableDiscountAmount={availableDiscountAmount} availableDiscountPercent={availableDiscountPercent} cap={cap} claimDiscount={claimDiscount} confirming={confirming} contactError={contactError} continueToPayment={continueToPayment} emailError={emailError} firstNameError={firstNameError} guestContact={guestContact} guestCount={guestCount} guestEmail={guestEmail} guestFirstName={guestFirstName} guestLastName={guestLastName} guestNote={guestNote} handlePaxStep={handlePaxStep} lastNameError={lastNameError} paxError={paxError} room={room} selectedAddOns={selectedAddOns} setClaimDiscount={setClaimDiscount} setContactError={setContactError} setEmailError={setEmailError} setFirstNameError={setFirstNameError} setGuestContact={setGuestContact} setGuestCount={setGuestCount} setGuestEmail={setGuestEmail} setGuestFirstName={setGuestFirstName} setGuestLastName={setGuestLastName} setGuestNote={setGuestNote} setLastNameError={setLastNameError} setSelectedAddOns={setSelectedAddOns} />}

            {step === 'payment' && room && selectedVariant && <CheckoutStep attemptId={attemptId} cardCvc={cardCvc} cardExpiry={cardExpiry} cardNumber={cardNumber} checkOriginalPayment={checkOriginalPayment} claimDiscount={claimDiscount} contactMessengerUrl={contactMessengerUrl} contactPhone={contactPhone} depositBalanceCopy={depositBalanceCopy} downPaymentAmount={downPaymentAmount} handleConfirmWalletPay={handleConfirmWalletPay} handleDemoPay={handleDemoPay} handlePayCard={handlePayCard} handleRetryPayment={handleRetryPayment} handleSelectMethod={handleSelectMethod} payError={payError} payErrorKind={payErrorKind} payLoading={payLoading} paymentChoice={paymentChoice} pmIntent={pmIntent} priceBreakdown={priceBreakdown} selectedDuration={selectedDuration} selectedMethod={selectedMethod} setCardCvc={setCardCvc} setCardExpiry={setCardExpiry} setCardNumber={setCardNumber} setPaymentChoice={setPaymentChoice} visiblePaymentMethods={visiblePaymentMethods} visiblePaymentOptions={visiblePaymentOptions} />}

            {step === 'paymongoReturn' && <PaymentVerificationStep pmReturn={pmReturn} room={room} selectedVariant={selectedVariant} handleDone={handleDone} handleRetryFromReturn={handleRetryFromReturn} contactMessengerUrl={contactMessengerUrl} contactPhone={contactPhone} />}
          </div>

          {showSummaryPanel && <div className="bk-summary-panel" aria-live="polite">
              <BookingSummaryContents room={room} selectedVariant={selectedVariant} selectedDate={selectedDate} selectedHour={selectedHour} selectedDuration={selectedDuration} guestName={guestName} guestContact={guestContact} guestEmail={guestEmail} guestCount={guestCount} guestNote={guestNote} selectedMethod={selectedMethod} subtotal={subtotalAmount} downPayment={downPaymentAmount} remainingBalance={remainingBalanceAmount} priceBreakdown={priceBreakdown} paymentChoice={paymentChoice} step={step} />
            </div>}
        </div>
        </div>
      </div>
      <Toast {...toast} />
    </ModalPortal>;
}
export default BookingModal;
