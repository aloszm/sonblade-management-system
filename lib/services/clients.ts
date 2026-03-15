import { supabaseAdmin as supabase } from '@/lib/supabase';
import type { Client } from '@/types';
import { hashPin } from '@/lib/utils/auth';

export async function getClients(): Promise<Client[]> {
    const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('name');

    if (error) throw error;
    return data || [];
}

export async function getClientById(id: string): Promise<Client | null> {
    const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
    }
    return data;
}

export async function createClient(client: Partial<Client>): Promise<Client> {
    const pin = client.pin ? await hashPin(client.pin) : undefined;
    const { data, error } = await supabase
        .from('clients')
        // `as never` needed because the untyped Supabase schema resolves table row type to `never`
        .insert({
            name: client.name,
            phone: client.phone,
            email: client.email,
            pin,
        } as never)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function updateClient(id: string, updates: Partial<Client>): Promise<Client> {
    if (updates.pin) {
        updates = { ...updates, pin: await hashPin(updates.pin) };
    }
    const { data, error } = await supabase
        .from('clients')
        // `as never` needed because the untyped Supabase schema resolves table row type to `never`
        .update({
            ...updates,
            updated_at: new Date().toISOString()
        } as never)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function deleteClient(id: string): Promise<void> {
    const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', id);

    if (error) throw error;
}

// Award points and record a visit atomically via Supabase RPC (no race condition)
export async function addClientPoints(id: string, points: number): Promise<void> {
    // `as never` needed because RPC arg types aren't in the untyped Supabase client schema
    const { error } = await supabase.rpc('add_client_visit', {
        p_client_id: id,
        p_points: points,
    } as never);
    if (error) throw error;
}
