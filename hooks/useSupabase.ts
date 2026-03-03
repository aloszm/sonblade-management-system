'use client';

import { useQuery } from '@tanstack/react-query';

type AsyncFn<T> = () => Promise<T>;

interface UseSupabaseResult<T> {
    data: T | null;
    loading: boolean;
    error: string | null;
    refetch: () => void;
}

export function useSupabase<T>(fn: AsyncFn<T>, deps: unknown[] = []): UseSupabaseResult<T> {
    const query = useQuery({
        // Use the function name or a hashed literal representation as part of the cache key
        queryKey: [fn.name || 'useSupabaseFn', fn.toString().slice(0, 60), ...deps],
        queryFn: fn,
        staleTime: 1000 * 60 * 5, // Cache for 5 minutes globally
        refetchOnWindowFocus: true,
    });

    return {
        data: query.data !== undefined ? query.data : null,
        loading: query.isLoading,
        error: query.error ? (query.error as Error).message : null,
        refetch: query.refetch,
    };
}
