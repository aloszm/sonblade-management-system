import '@testing-library/jest-dom/vitest';
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
    default: ({ children, href, ...props }: any) => {
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
    BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
    Bar: () => <div />,
    XAxis: () => <div />,
    YAxis: () => <div />,
    Tooltip: () => <div />,
    ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
    CartesianGrid: () => <div />,
}));
