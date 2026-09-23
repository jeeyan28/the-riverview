const TERMINAL_PAYMENT_STATUSES = new Set(['expired', 'cancelled', 'failed']);

export function terminalPaymentFailure(data, { httpStatus = 200, awaitingMethodChecks = 0 } = {}) {
  const status = data?.status;
  if (TERMINAL_PAYMENT_STATUSES.has(status)) {
    return {
      phase: status,
      message: data.message || (status === 'expired'
        ? 'This payment session expired before it was completed. No charge was made.'
        : status === 'cancelled'
          ? 'This payment was cancelled. No charge was made.'
          : 'The payment could not be completed. No charge was made.'),
    };
  }

  if (httpStatus === 410) {
    return { phase: 'expired', message: data?.message || 'This payment session expired. Check your reservations before trying again.' };
  }
  if (httpStatus === 402 || (status === 'awaiting_payment_method' && awaitingMethodChecks >= 2)) {
    return {
      phase: 'failed',
      message: data?.message || 'The payment did not go through. Choose another method to try again. If your bank shows a charge, check your reservations first.',
    };
  }
  return null;
}
