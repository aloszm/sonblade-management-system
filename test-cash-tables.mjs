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

async function checkTables() {
    const { data, error } = await supabase.from('cash_sessions').select('id').limit(1);
    if (error) {
        console.log('Error checking cash_sessions:', error.message);
    } else {
        console.log('cash_sessions table exists.');
    }
}

checkTables().catch(console.error);
