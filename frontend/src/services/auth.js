import { apiRequest, ApiError } from './api.js';

const BASE = '/api/auth';
const post = (path, body, fallbackMessage) => apiRequest(`${BASE}${path}`, { method: 'POST', body, fallbackMessage });

function authenticatedUser(data) {
  if (!data?.user?._id) throw new ApiError('The server returned an invalid session. Please sign in again.', { code: 'INVALID_RESPONSE' });
  return data.user;
}

function verifiedReset(data) {
  if (typeof data?.resetSessionToken !== 'string' || !data.resetSessionToken.trim()) {
    throw new ApiError('The server could not verify the code. Please try again.', { code: 'INVALID_RESPONSE' });
  }
  return data;
}

export const authService = {
  me: options => apiRequest(`${BASE}/me`, { ...options, fallbackMessage: 'Could not check your session.' }).then(authenticatedUser),
  login: (email, password) => post('/login', { email, password }, 'Login failed.').then(authenticatedUser),
  loginWithGoogle: code => post('/google', { code }, 'Google sign-in failed.').then(authenticatedUser),
  register: form => post('/register', form, 'Registration failed.'),
  verifyRegistrationOtp: (email, otp) => post('/register/verify-otp', { email, otp }, 'Verification failed.'),
  resendRegistrationOtp: email => post('/register/resend-otp', { email }, 'Could not resend the code.'),
  resendAccountVerification: email => post('/resend-verification', { email }, 'Could not resend the code.'),
  verifyAccountOtp: (email, otp) => post('/verify-account-otp', { email, otp }, 'Verification failed.'),
  requestReset: email => post('/forgot-password', { email }, 'Could not send a verification code. Please try again.'),
  verifyResetOtp: (email, otp) => post('/verify-otp', { email, otp }, 'Incorrect verification code.').then(verifiedReset),
  resetPassword: (resetSessionToken, password) => post('/reset-password', { resetSessionToken, password }, 'Could not reset password.'),
  logout: () => post('/logout', undefined, 'Could not log out. Please try again.'),
};
