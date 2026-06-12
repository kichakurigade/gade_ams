'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { authApi, ApiError } from '@/lib/api';

// ─── Step 1 schema ──────────────────────────────────────────────────────────
const loginSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(1, 'Password required'),
});

// ─── Step 2 schema ──────────────────────────────────────────────────────────
const totpSchema = z.object({
  token: z
    .string()
    .length(6, 'Must be exactly 6 digits')
    .regex(/^\d+$/, 'Digits only'),
});

type Step = 'credentials' | 'totp_setup' | 'totp_verify';

export function LoginForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('credentials');
  const [userId, setUserId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // ─── Step 1: credentials form ────────────────────────────────────────────
  const credForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
  });

  const onCredentialsSubmit = async (data: z.infer<typeof loginSchema>) => {
    setServerError(null);
    setIsLoading(true);
    try {
      const res = await authApi.login(data.email, data.password);
      setUserId(res.userId);
      if ('requires2faSetup' in res) {
        setQrDataUrl(res.qrDataUrl);
        setTotpSecret(res.secret);
        setStep('totp_setup');
      } else {
        setStep('totp_verify');
      }
    } catch (e) {
      setServerError(e instanceof ApiError ? e.message : 'Sign-in failed');
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Step 2: TOTP form ────────────────────────────────────────────────────
  const totpForm = useForm<z.infer<typeof totpSchema>>({
    resolver: zodResolver(totpSchema),
  });

  const onTotpSubmit = async (data: z.infer<typeof totpSchema>) => {
    if (!userId) return;
    setServerError(null);
    setIsLoading(true);
    try {
      const res = await authApi.verifyTotp(userId, data.token);
      queryClient.setQueryData(['auth', 'me'], { user: res.user });
      router.push('/dashboard/engagements');
    } catch (e) {
      setServerError(e instanceof ApiError ? e.message : '2FA verification failed');
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  if (step === 'credentials') {
    return (
      <div className="bg-white rounded-xl border border-surface-border shadow-sm p-8 space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Sign in</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Enter your credentials to continue
          </p>
        </div>

        <form onSubmit={credForm.handleSubmit(onCredentialsSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="email">
              Email address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className="w-full px-3 py-2 rounded-lg border border-surface-border text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
              placeholder="you@gadeassociates.co.ke"
              {...credForm.register('email')}
            />
            {credForm.formState.errors.email && (
              <p className="text-xs text-destructive">{credForm.formState.errors.email.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="w-full px-3 py-2 rounded-lg border border-surface-border text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
              {...credForm.register('password')}
            />
            {credForm.formState.errors.password && (
              <p className="text-xs text-destructive">
                {credForm.formState.errors.password.message}
              </p>
            )}
          </div>

          {serverError && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
              {serverError}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Signing in…' : 'Continue'}
          </button>
        </form>
      </div>
    );
  }

  if (step === 'totp_setup') {
    return (
      <div className="bg-white rounded-xl border border-surface-border shadow-sm p-8 space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Set up 2FA</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
          </p>
        </div>

        {qrDataUrl && (
          <div className="flex flex-col items-center gap-3">
            <img src={qrDataUrl} alt="TOTP QR code" className="w-40 h-40 rounded-lg border" />
            {totpSecret && (
              <p className="text-xs text-muted-foreground text-center">
                Or enter manually: <span className="font-mono font-medium text-foreground">{totpSecret}</span>
              </p>
            )}
          </div>
        )}

        <form onSubmit={totpForm.handleSubmit(onTotpSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="totp-token">
              Enter the 6-digit code to confirm setup
            </label>
            <input
              id="totp-token"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="w-full px-3 py-2 rounded-lg border border-surface-border text-sm font-mono text-center tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
              placeholder="000000"
              {...totpForm.register('token')}
            />
            {totpForm.formState.errors.token && (
              <p className="text-xs text-destructive">{totpForm.formState.errors.token.message}</p>
            )}
          </div>

          {serverError && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
              {serverError}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-light transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Verifying…' : 'Complete 2FA setup'}
          </button>
        </form>
      </div>
    );
  }

  // totp_verify
  return (
    <div className="bg-white rounded-xl border border-surface-border shadow-sm p-8 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Two-factor authentication</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Enter the 6-digit code from your authenticator app
        </p>
      </div>

      <form onSubmit={totpForm.handleSubmit(onTotpSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="totp-code">
            Authentication code
          </label>
          <input
            id="totp-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={6}
            className="w-full px-3 py-2 rounded-lg border border-surface-border text-sm font-mono text-center tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
            placeholder="000000"
            {...totpForm.register('token')}
          />
          {totpForm.formState.errors.token && (
            <p className="text-xs text-destructive">{totpForm.formState.errors.token.message}</p>
          )}
        </div>

        {serverError && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
            {serverError}
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-2.5 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-light transition-colors disabled:opacity-50"
        >
          {isLoading ? 'Verifying…' : 'Sign in'}
        </button>

        <button
          type="button"
          onClick={() => { setStep('credentials'); setUserId(null); setServerError(null); }}
          className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Back to sign in
        </button>
      </form>
    </div>
  );
}
