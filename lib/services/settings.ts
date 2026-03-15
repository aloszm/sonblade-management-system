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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data ? (data as any).value : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateSettings(key: string, value: any) {
    const { data, error } = await supabase
        .from('settings')
        .upsert({ key, value, updated_at: new Date().toISOString() } as never)
        .select()
        .single();

    if (error) throw error;
    return data;
}
