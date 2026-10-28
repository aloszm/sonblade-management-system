export const dynamic = 'force-dynamic';

export async function GET() {
    const configured = Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
        (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    );
    return Response.json({ status: configured ? 'ok' : 'misconfigured' }, {
        status: configured ? 200 : 503,
        headers: { 'Cache-Control': 'no-store' },
    });
}

