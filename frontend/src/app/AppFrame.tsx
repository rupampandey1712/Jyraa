'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowRightOnRectangleIcon,
  ChartBarSquareIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  Cog6ToothIcon,
  CpuChipIcon,
  FolderIcon,
  HomeIcon,
  MagnifyingGlassIcon,
  QuestionMarkCircleIcon,
  Squares2X2Icon,
  ViewColumnsIcon,
} from '@heroicons/react/24/outline';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { BrandMark } from '@/components/BrandMark';

const publicRoutes = new Set(['/login', '/register']);

const RAIL_STORAGE_KEY = 'zyraa.rail.collapsed';

/**
 * The hub rail, in Azure DevOps terms: a flat list of hubs, each of which can
 * expand into the pivots it owns. A hub is selected when the route sits inside
 * it, which is also what expands its children.
 */
interface Hub {
  href: string;
  label: string;
  icon: typeof HomeIcon;
  children?: { href: string; label: string }[];
}

const hubs: Hub[] = [
  {
    href: '/',
    label: 'Overview',
    icon: HomeIcon,
    children: [
      { href: '/', label: 'Summary' },
      { href: '/dashboards', label: 'Dashboards' },
    ],
  },
  { href: '/projects', label: 'Projects', icon: FolderIcon },
  {
    href: '/boards',
    label: 'Boards',
    icon: ViewColumnsIcon,
    children: [
      { href: '/boards', label: 'Boards' },
      { href: '/planning', label: 'Sprints' },
      { href: '/search', label: 'Queries' },
    ],
  },
  { href: '/analytics', label: 'Analytics', icon: ChartBarSquareIcon },
  { href: '/agents', label: 'Agents', icon: CpuChipIcon },
  { href: '/admin', label: 'Project settings', icon: Cog6ToothIcon },
];

/** Routes that belong to a hub without having their own row in the rail. */
const hubAliases: Record<string, string> = {
  '/issues': '/boards',
  '/projects': '/projects',
};

function activeHub(pathname: string): Hub | undefined {
  for (const [prefix, href] of Object.entries(hubAliases)) {
    if (pathname.startsWith(prefix)) {
      const aliased = hubs.find((hub) => hub.href === href);
      if (aliased) return aliased;
    }
  }
  // Longest matching href wins, so /boards/123 picks Boards over Overview.
  return [...hubs]
    .filter((hub) => (hub.href === '/' ? pathname === '/' : pathname.startsWith(hub.href)))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

/** Breadcrumb trail and page heading for the current route. */
function routeMeta(pathname: string): { title: string; crumb: string | null } {
  if (pathname === '/') return { title: 'Summary', crumb: 'Overview' };
  if (pathname.startsWith('/dashboards')) return { title: 'Dashboards', crumb: 'Overview' };
  if (pathname.startsWith('/projects/new')) return { title: 'New project', crumb: 'Projects' };
  if (pathname.startsWith('/projects/')) return { title: 'Project', crumb: 'Projects' };
  if (pathname.startsWith('/projects')) return { title: 'Projects', crumb: null };
  if (pathname.startsWith('/boards/')) return { title: 'Board', crumb: 'Boards' };
  if (pathname.startsWith('/boards')) return { title: 'Boards', crumb: null };
  if (pathname.startsWith('/issues/')) return { title: 'Work item', crumb: 'Boards' };
  if (pathname.startsWith('/planning')) return { title: 'Sprints', crumb: 'Boards' };
  if (pathname.startsWith('/search')) return { title: 'Queries', crumb: 'Boards' };
  if (pathname.startsWith('/analytics')) return { title: 'Analytics', crumb: null };
  if (pathname.startsWith('/agents')) return { title: 'Agents', crumb: null };
  if (pathname.startsWith('/admin')) return { title: 'Project settings', crumb: null };
  return { title: 'ZYRAA', crumb: null };
}

function isSelected(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

/** The top organization bar: product, breadcrumb, search, and account. */
function TopBar({ crumb, title, onSignOut, initial, name }: {
  crumb: string | null;
  title: string;
  onSignOut: () => void;
  initial: string;
  name: string;
}) {
  return (
    <header className="ado-header sticky top-0 z-30 flex items-center gap-3 px-3">
      <Link href="/" className="flex shrink-0 items-center gap-2 pr-2">
        <BrandMark compact showWordmark={false} />
        <span className="text-[15px] font-semibold text-[color:var(--text-primary)]">ZYRAA</span>
      </Link>

      <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-[13px] md:flex">
        <span className="text-[color:var(--text-disabled)]">/</span>
        {crumb ? (
          <>
            <span className="truncate text-[color:var(--text-secondary)]">{crumb}</span>
            <span className="text-[color:var(--text-disabled)]">/</span>
          </>
        ) : null}
        <span className="truncate font-semibold">{title}</span>
      </nav>

      <div className="ml-auto flex items-center gap-1">
        <label className="relative hidden sm:block">
          <span className="sr-only">Search</span>
          <MagnifyingGlassIcon className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--text-secondary)]" />
          <input
            type="search"
            placeholder="Search"
            className="h-8 w-44 pl-8 pr-2 text-[13px] lg:w-60"
          />
        </label>

        <button className="command-button h-8 w-8 justify-center px-0" aria-label="Help">
          <QuestionMarkCircleIcon className="h-5 w-5 text-[color:var(--text-secondary)]" />
        </button>

        <div className="flex items-center gap-2 pl-1">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full bg-[color:var(--accent)] text-[12px] font-semibold text-white"
            title={name}
          >
            {initial}
          </span>
          <button onClick={onSignOut} className="command-button h-8 w-8 justify-center px-0" aria-label="Sign out">
            <ArrowRightOnRectangleIcon className="h-5 w-5 text-[color:var(--text-secondary)]" />
          </button>
        </div>
      </div>
    </header>
  );
}

/** The left hub rail, collapsible down to icons. */
function HubRail({ pathname, collapsed, onToggle }: {
  pathname: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const current = activeHub(pathname);

  return (
    <aside
      className="ado-rail fixed left-0 top-[var(--header-height)] bottom-0 z-20 hidden flex-col md:flex"
      style={{ width: collapsed ? 'var(--rail-width-collapsed)' : 'var(--rail-width)' }}
    >
      <nav className="flex-1 overflow-y-auto py-2" aria-label="Hubs">
        {hubs.map((hub) => {
          const Icon = hub.icon;
          const selected = current?.href === hub.href;
          const showChildren = !collapsed && selected && hub.children;

          return (
            <div key={hub.href}>
              <Link
                href={hub.href}
                className="hub-item"
                data-selected={selected && (!hub.children || collapsed)}
                title={collapsed ? hub.label : undefined}
              >
                <Icon className="h-[18px] w-[18px] shrink-0 text-[color:var(--text-secondary)]" />
                {!collapsed ? <span className="truncate">{hub.label}</span> : null}
              </Link>

              {showChildren
                ? hub.children!.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      className="hub-item"
                      data-child="true"
                      data-selected={isSelected(pathname, child.href)}
                    >
                      <span className="truncate">{child.label}</span>
                    </Link>
                  ))
                : null}
            </div>
          );
        })}
      </nav>

      <button
        onClick={onToggle}
        className="hub-item shrink-0 border-t border-[color:var(--line)]"
        aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
      >
        {collapsed ? (
          <ChevronDoubleRightIcon className="h-[18px] w-[18px] text-[color:var(--text-secondary)]" />
        ) : (
          <>
            <ChevronDoubleLeftIcon className="h-[18px] w-[18px] text-[color:var(--text-secondary)]" />
            <span className="text-[13px] text-[color:var(--text-secondary)]">Collapse</span>
          </>
        )}
      </button>
    </aside>
  );
}

/** Pivot tabs for the active hub, shown under the page title. */
function Pivots({ pathname }: { pathname: string }) {
  const current = activeHub(pathname);
  if (!current?.children) return null;

  return (
    <div className="flex items-center gap-1 border-b border-[color:var(--line)] px-4 sm:px-6">
      {current.children.map((child) => (
        <Link key={child.href} href={child.href} className="pivot" data-selected={isSelected(pathname, child.href)}>
          {child.label}
        </Link>
      ))}
    </div>
  );
}

/** A compact hub switcher for viewports too narrow for the rail. */
function MobileHubs({ pathname }: { pathname: string }) {
  const current = activeHub(pathname);
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-[color:var(--line)] bg-[color:var(--nav-bg)] px-2 py-1 md:hidden">
      {hubs.map((hub) => (
        <Link
          key={hub.href}
          href={hub.href}
          className="shrink-0 rounded-sm px-2.5 py-1.5 text-[13px]"
          style={
            current?.href === hub.href
              ? { background: 'var(--surface)', fontWeight: 600, boxShadow: 'inset 0 -2px 0 var(--accent)' }
              : { color: 'var(--text-secondary)' }
          }
        >
          {hub.label}
        </Link>
      ))}
    </div>
  );
}

function ShellLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const { token, user, logout, isLoading } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  // The rail state is a per-browser preference, so it lives in localStorage.
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(RAIL_STORAGE_KEY) === '1');
    } catch {
      // Storage can be unavailable; the default expanded rail is fine.
    }
  }, []);

  const toggleRail = () => {
    setCollapsed((previous) => {
      const next = !previous;
      try {
        window.localStorage.setItem(RAIL_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // Ignore: the preference simply will not persist.
      }
      return next;
    });
  };

  const meta = useMemo(() => routeMeta(pathname), [pathname]);

  if (publicRoutes.has(pathname)) {
    return <>{children}</>;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[13px] text-[color:var(--text-secondary)]">
        Loading your workspace…
      </div>
    );
  }

  if (!token) {
    return <>{children}</>;
  }

  const userInitial = (user?.display_name || user?.username || 'Z').charAt(0).toUpperCase();
  const userName = user?.display_name || user?.username || 'Workspace user';

  return (
    <div className="min-h-screen">
      <TopBar
        crumb={meta.crumb}
        title={meta.title}
        onSignOut={logout}
        initial={userInitial}
        name={userName}
      />

      <HubRail pathname={pathname} collapsed={collapsed} onToggle={toggleRail} />

      {/* The rail is fixed, so the content pane carries a matching left inset. */}
      <div data-rail={collapsed ? 'collapsed' : 'expanded'}>
        <MobileHubs pathname={pathname} />

        <div className="bg-[color:var(--surface)]">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-2 pt-4 sm:px-6">
            <h1 className="app-title">{meta.title}</h1>
            <button
              onClick={() => router.push('/projects/new')}
              className="button-primary h-8 px-3 text-[13px]"
            >
              New project
            </button>
          </div>
          <Pivots pathname={pathname} />
        </div>

        <main className="px-4 py-4 sm:px-6">{children}</main>
      </div>
    </div>
  );
}

export function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ShellLayout>{children}</ShellLayout>
    </AuthProvider>
  );
}
