import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-KE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date));
}

export function formatCurrency(amount: number, currency = 'KES'): string {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function riskClassificationLabel(rc: string): string {
  const map: Record<string, string> = {
    NORMAL: 'Normal',
    GTN: 'Greater Than Normal',
    MGTN: 'Much Greater Than Normal',
  };
  return map[rc] ?? rc;
}

export function riskClassificationVariant(rc: string): 'normal' | 'gtn' | 'mgtn' {
  if (rc === 'GTN') return 'gtn';
  if (rc === 'MGTN') return 'mgtn';
  return 'normal';
}
