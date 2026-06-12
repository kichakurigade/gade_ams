import type { Metadata } from 'next';
import { LoginForm } from '@/components/ams/LoginForm';

export const metadata: Metadata = { title: 'Sign In' };

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-surface-secondary flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Firm branding */}
        <div className="text-center space-y-1">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand text-white font-bold text-xl mb-3">
            G
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Gade AMS</h1>
          <p className="text-sm text-muted-foreground">Audit Management System</p>
        </div>

        <LoginForm />

        <p className="text-center text-xs text-muted-foreground">
          Gade Associates CPA(K) · P051591395M · Nairobi, Kenya
        </p>
      </div>
    </main>
  );
}
