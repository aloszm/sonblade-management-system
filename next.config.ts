import type { NextConfig } from 'next';

// El navegador sube los comprobantes de gastos directo a Supabase Storage (enlace firmado): el origen del proyecto debe
// poder usarse en connect-src, o la política bloquea la subida («Refused to connect»).
function supabaseOrigin(): string {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : '';
  } catch {
    return '';
  }
}

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload'
  },
  {
    key: 'Content-Security-Policy',
    value: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ${supabaseOrigin()}; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`.replace(/\s+;/g, ';')
  }
];

const nextConfig: NextConfig = {
  eslint: {
    // ESLint is run separately (npm run lint); not during next build
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
