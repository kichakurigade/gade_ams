'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  Settings,
  LogOut,
  BookOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCurrentUser, useLogout } from '@/hooks/useAuth';

// (dashboard) is a route group — it does not appear in URLs.
const NAV_ITEMS = [
  { href: '/engagements', label: 'Engagements', icon: FolderKanban },
  { href: '/clients', label: 'Clients', icon: Users },
  { href: '/procedures', label: 'Procedure Library', icon: BookOpen },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data } = useCurrentUser();
  const logout = useLogout();

  return (
    <aside className="w-60 flex-shrink-0 bg-brand text-white flex flex-col">
      {/* Logo / firm name */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-white font-bold text-sm">
            G
          </div>
          <div>
            <p className="font-semibold text-sm leading-tight">Gade AMS</p>
            <p className="text-white/50 text-xs">Audit Management</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              pathname.startsWith(href)
                ? 'bg-white/15 text-white'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            )}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      {/* User + logout */}
      <div className="px-3 py-4 border-t border-white/10 space-y-0.5">
        {data?.user && (
          <div className="px-3 py-2 text-xs text-white/50">
            <p className="font-medium text-white/80">
              {data.user.firstName} {data.user.lastName}
            </p>
            <p>{data.user.role.replace(/_/g, ' ')}</p>
          </div>
        )}
        <button
          onClick={() => logout.mutate()}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
