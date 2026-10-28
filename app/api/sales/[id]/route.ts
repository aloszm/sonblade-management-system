export async function DELETE() {
    return Response.json({ error: 'Las ventas son registros inmutables. Usa el flujo de reversa aprobado.' }, { status: 405 });
}

