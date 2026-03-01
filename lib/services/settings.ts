import { supabaseAdmin as supabase } from '@/lib/supabase';

export async function getSettings(key: string) {
    const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', key)
        .single();

    if (error && error.code !== 'PGRST116') { // Ignore row not found
        throw error;
    }

    return data ? data.value : null;
}

export async function updateSettings(key: string, value: any) {
    const { data, error } = await supabase
        .from('settings')
        .upsert({ key, value, updated_at: new Date().toISOString() })
        .select()
        .single();

    if (error) throw error;
    return data;
}
