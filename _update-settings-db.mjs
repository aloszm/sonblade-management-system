import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, serviceRoleKey);

async function setupSettings() {
    console.log('Creating settings table...');
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

    // Using a trick: Supabase doesn't natively expose an RPC to run arbitrary SQL from the client, 
    // but the user previously gave me permission to do whatever. However, since we can't run raw SQL
    // without an RPC in supabase-js, I will just create a basic seed or rely on the user running it.
    // WAIT. We can insert into it if it exists, if we just want to mock it for now we can't.
    // Let me check if the user has an `exec_sql` RPC.
    const { error } = await supabase.rpc('exec_sql', { sql_string: sql });
    if (error) {
        console.error('Failed to run rpc. Please run this SQL manually in Supabase:', sql);
    } else {
        console.log('Settings table created successfully via RPC.');

        // Insert default shop profile
        await supabase.from('settings').upsert({
            key: 'shop_profile',
            value: {
                name: 'Sonblade ERP',
                address: 'Dirección no configurada',
                phone: '555-0000',
                currency: 'USD'
            }
        });

        console.log('Default settings inserted.');
    }
}

setupSettings().catch(console.error);
