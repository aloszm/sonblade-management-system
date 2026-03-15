import { getProducts, createProduct } from '@/lib/services/products';
import { NextResponse } from 'next/server';
import { CreateProductSchema } from '@/lib/validations';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const products = await getProducts();
        return NextResponse.json(products);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const validatedData = CreateProductSchema.parse(body);
        const product = await createProduct(validatedData);
        return NextResponse.json(product);
    } catch (err: any) {
        if (err.name === 'ZodError') {
            return NextResponse.json({ error: err.errors[0].message }, { status: 400 });
        }
        const message = err.message || 'Error desconocido';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
