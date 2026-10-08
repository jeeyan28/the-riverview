import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../../src/context/AuthContext';
import { authService } from '../../src/services/auth';

vi.mock('../../src/services/auth', () => ({ authService: { me: vi.fn(), login: vi.fn(), loginWithGoogle: vi.fn(), logout: vi.fn(), register: vi.fn(), verifyRegistrationOtp: vi.fn(), resendRegistrationOtp: vi.fn(), resendAccountVerification: vi.fn(), verifyAccountOtp: vi.fn() } }));
const customer = { _id: '507f1f77bcf86cd799439011', firstName: 'Demo', role: 'user' };
let context;
function Consumer() {
  context = useAuth();
  return <><p data-testid="identity">{context.user?.firstName || 'Guest'}</p><p data-testid="verification">{context.sessionStatus}</p><p>{context.sessionError}</p><p>{context.logoutError}</p></>;
}
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function storage() { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key), clear: () => data.clear() }; }
beforeEach(() => { vi.stubGlobal('localStorage', storage()); vi.stubGlobal('sessionStorage', storage()); vi.resetAllMocks(); });
afterEach(cleanup);
describe('session outcomes', () => {
  it('keeps identity on dependency failure and recovers on retry', async () => {
    localStorage.setItem('riverview_user', JSON.stringify(customer));
    authService.me.mockRejectedValueOnce({ status: 503 });
    render(<AuthProvider><Consumer /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('verification').textContent).toBe('unavailable'));
    expect(screen.getByTestId('identity').textContent).toBe('Demo');
    expect(context.sessionVerified).toBe(false);
    authService.me.mockResolvedValueOnce(customer);
    await act(() => context.revalidate());
    expect(context.sessionVerified).toBe(true);
  });
  it('clears identity only for authoritative authentication failure', async () => {
    localStorage.setItem('riverview_user', JSON.stringify(customer));
    authService.me.mockRejectedValue({ status: 401 });
    render(<AuthProvider><Consumer /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('identity').textContent).toBe('Guest'));
    expect(localStorage.getItem('riverview_user')).toBeNull();
  });
  it.each([{ status: 503 }, { code: 'NETWORK_ERROR' }])('failed logout keeps identity and retry feedback (%j)', async error => {
    authService.me.mockResolvedValue(customer);
    render(<AuthProvider><Consumer /></AuthProvider>);
    await waitFor(() => expect(context.sessionVerified).toBe(true));
    authService.logout.mockRejectedValueOnce(error);
    await act(async () => { await expect(context.logout()).rejects.toEqual(error); });
    expect(context.user).toEqual(customer);
    expect(context.logoutError).toMatch(/try again/i);
    authService.logout.mockResolvedValueOnce({});
    await act(() => context.logout());
    expect(context.user).toBeNull();
  });
  it.each(['login', 'logout', 'profile'])('delayed session check cannot overwrite a newer %s', async action => {
    const pending = deferred();
    authService.me.mockReturnValueOnce(pending.promise);
    localStorage.setItem('riverview_user', JSON.stringify(customer));
    render(<AuthProvider><Consumer /></AuthProvider>);
    if (action === 'login') { authService.login.mockResolvedValue({ ...customer, firstName: 'New' }); await act(() => context.login('demo@example.test', 'fixture')); }
    if (action === 'logout') { authService.logout.mockResolvedValue({}); await act(() => context.logout()); }
    if (action === 'profile') await act(() => context.updateUser({ firstName: 'New' }));
    await act(async () => pending.resolve({ ...customer, firstName: 'Old' }));
    expect(context.user?.firstName || 'Guest').toBe(action === 'logout' ? 'Guest' : 'New');
  });
});
