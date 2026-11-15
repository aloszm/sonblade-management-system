import '@testing-library/jest-dom/vitest';
import type { ComponentProps, ReactNode } from 'react';
import { vi } from 'vitest';

// Mock next/navigation
vi.mock('next/navigation', () => ({
    usePathname: () => '/',
    useRouter: () => ({
        push: vi.fn(),
        replace: vi.fn(),
        back: vi.fn(),
    }),
}));

// Mock next/link
vi.mock('next/link', () => ({
    default: ({ children, href, ...props }: ComponentProps<'a'>) => {
        return <a href={href} {...props}>{children}</a>;
    },
}));

// Mock next/font/google
vi.mock('next/font/google', () => ({
    Inter: () => ({
        variable: '--font-inter',
        className: 'inter',
    }),
}));

// Mock useSupabase hook
vi.mock('@/hooks/useSupabase', () => ({
    useSupabase: () => ({
        data: null,
        loading: false,
        error: null,
        refetch: vi.fn(),
    }),
}));

// Mock recharts to avoid canvas errors in tests
vi.mock('recharts', () => ({
    BarChart: ({ children }: { children?: ReactNode }) => <div data-testid="bar-chart">{children}</div>,
    Bar: () => <div />,
    LineChart: ({ children }: { children?: ReactNode }) => <div data-testid="line-chart">{children}</div>,
    ComposedChart: ({ children }: { children?: ReactNode }) => <div data-testid="composed-chart">{children}</div>,
    Line: () => <div />,
    AreaChart: ({ children }: { children?: ReactNode }) => <div data-testid="area-chart">{children}</div>,
    Area: () => <div />,
    PieChart: ({ children }: { children?: ReactNode }) => <div data-testid="pie-chart">{children}</div>,
    Pie: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    Cell: () => <div />,
    XAxis: () => <div />,
    YAxis: () => <div />,
    Tooltip: () => <div />,
    Legend: () => <div />,
    ResponsiveContainer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    CartesianGrid: () => <div />,
}));

// Mock global fetch for relative API calls
global.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = input.toString();
    if (url.includes('/api/auth/me')) {
        return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ authenticated: true, user: { role: 'admin', name: 'Alonso Miranda', id: '123' } }),
        } as Response);
    }
    if (url.includes('/api/dashboard')) {
        return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
                kpis: { revenue: 5000, cuts: 15, tips: 500, expenses: 100 },
                barbersTable: [
                    { id: '1', name: 'Deya', avatar_url: '', cuts: 10, revenue: 3000, commission: 1500, rate: 50 },
                    { id: '2', name: 'Sonny', avatar_url: '', cuts: 5, revenue: 2000, commission: 800, rate: 40 }
                ],
                charts: { weekBar: [], monthLine: [], paymentDonut: [] }
            }),
        } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
});
