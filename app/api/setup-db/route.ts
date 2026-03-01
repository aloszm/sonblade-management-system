import { supabaseAdmin as supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const sql = `
            CREATE TABLE IF NOT EXISTS settings (
                id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                key TEXT UNIQUE NOT NULL,
                value JSONB NOT NULL,
                updated_at TIMESTAMPTZ DEFAULT now()
            );
            ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
            
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_policies
                    WHERE tablename = 'settings' AND policyname = 'dev_all_settings'
                ) THEN
                    CREATE POLICY "dev_all_settings" ON settings FOR ALL USING (true) WITH CHECK (true);
                END IF;
            END
            $$;
        `;

        await supabase.rpc('exec_sql', { sql_string: sql });

        await supabase.from('settings').upsert({
            key: 'shop_profile',
            value: {
                name: 'Sonblade ERP',
                address: 'Dirección no configurada',
                phone: '555-0000',
                currency: 'USD'
            }
        });

        return NextResponse.json({ success: true, message: 'Settings database applied' });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
