'use client';

import { useState, useEffect, useCallback } from 'react';

type AsyncFn<T> = () => Promise<T>;

interface UseSupabaseResult<T> {
    data: T | null;
    loading: boolean;
    error: string | null;
    refetch: () => void;
}

export function useSupabase<T>(fn: AsyncFn<T>, deps: unknown[] = []): UseSupabaseResult<T> {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const result = await fn();
            setData(result);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Error al cargar datos';
            setError(message);
            console.error('useSupabase error:', err);
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return { data, loading, error, refetch: fetchData };
}
