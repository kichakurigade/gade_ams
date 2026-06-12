import { redirect } from 'next/navigation';

// Root redirect: authenticated users → dashboard, others → login
export default function RootPage() {
  redirect('/dashboard');
}
