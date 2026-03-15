# Rules — Proyecto Sonblade
# Archivo: sonblade-management-system/.agent/rules/proyecto.md
# Aplica a: Solo cuando trabajas en el repo de Sonblade
# Cliente: Sonblade (barbería)
# Desarrollado por: Weia Agency

---

## Contexto del Proyecto

**Sonblade** es un sistema SaaS multi-tenant de gestión para barberías desarrollado
por Weia Agency para el cliente Sonblade.

La arquitectura multi-tenant de este proyecto sirve como **base reutilizable**
para futuros micro-SaaS de Weia en otros verticales (salud, restaurantes, etc.).

**Estado actual:** Casi completo. Priorizar correcciones y estabilidad sobre nuevas features.

---

## Stack Específico de Sonblade

```
Next.js 15 App Router
React 19
TypeScript strict (sin any, sin prefijo I en interfaces)
Tailwind CSS v4
Supabase (PostgreSQL + Auth + Storage)
TanStack Query — estado del servidor
Zustand — estado global del cliente
Zod — validación de esquemas
jose — firma y verificación de JWT
Framer Motion — animaciones
Recharts — gráficos de reportes
date-fns + date-fns-tz — manejo de fechas en CDMX (America/Mexico_City)
Vitest + @testing-library/react — tests
```

---

## Estructura de Rutas (App Router)

```
app/
├── (auth)/              → login, registro
├── admin/               → panel de administración del dueño
├── barbero/             → vista del barbero individual
├── caja/                → apertura/cierre de caja, movimientos
├── citas/               → agenda y gestión de citas
├── clientes/            → ficha y historial de clientes
├── configuracion/       → settings del negocio
├── equipo/              → gestión de barbers
├── inventario/          → control de productos (Tier 2+)
├── pos/                 → punto de venta
├── reportes/            → métricas y estadísticas (Tier 2+)
├── ventas/              → historial de ventas
└── api/
    ├── admin/
    ├── audit/
    ├── auth/
    ├── barbers/
    ├── cash/
    ├── clients/
    ├── dashboard/
    ├── products/
    ├── sales/
    └── services/
```

---

## Modelo Multi-Tenant (Crítico)

Cada barbería es un **tenant** identificado por `shop_id`.

**Regla absoluta:** TODA query a Supabase debe filtrar por `shop_id`.
Un tenant nunca puede leer, escribir ni modificar datos de otro tenant.

```typescript
// ✅ Correcto — siempre filtrar por shop_id
const { data } = await supabase
  .from('barbers')
  .select('*')
  .eq('shop_id', shopId)

// ❌ Prohibido — query sin aislamiento de tenant
const { data } = await supabase
  .from('barbers')
  .select('*')
```

---

## Sistema de Tiers (Feature Flags)

Los tiers NO son versiones separadas del código. Son **feature flags** en la tabla `shops`.

```sql
-- Columnas de feature flags en tabla shops
has_inventory     boolean DEFAULT false  -- Tier 2+
has_reports       boolean DEFAULT false  -- Tier 2+
has_whatsapp      boolean DEFAULT false  -- Tier 2+
has_multi_branch  boolean DEFAULT false  -- Tier 3
tier              text    DEFAULT 'esencial'  -- 'esencial' | 'profesional' | 'cadena'
```

```typescript
// ✅ Correcto — módulos activados por flag
{shop.has_inventory && <InventoryModule />}
{shop.has_reports && <ReportsModule />}
{shop.has_multi_branch && <BranchSelector />}

// ❌ Prohibido — hardcodear tier en lógica
{shop.tier === 'profesional' && <InventoryModule />}
```

**Regla:** Nunca uses el string del tier directamente en condiciones.
Siempre usa los boolean flags. Si suben de tier, solo cambia un flag en DB — sin nuevo código.

---

## Reglas de Base de Datos (Supabase)

### Cliente correcto por contexto

```typescript
// lib/supabase.ts — dos clientes distintos con propósitos distintos

// Cliente del BROWSER — para auth y real-time únicamente
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

// Cliente del SERVIDOR — para todas las queries de datos
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
// O con service role para operaciones administrativas (solo en API routes)
```

### RLS — Row Level Security

**TODA tabla nueva debe tener RLS habilitado antes de salir a producción.**

```sql
-- Patrón obligatorio para cada tabla nueva
ALTER TABLE nueva_tabla ENABLE ROW LEVEL SECURITY;

-- Política SELECT — solo ver datos propios del tenant
CREATE POLICY "tenant_select_nueva_tabla"
ON nueva_tabla FOR SELECT
USING (shop_id = (auth.jwt() ->> 'shop_id')::uuid);

-- Política INSERT — solo insertar en propio tenant
CREATE POLICY "tenant_insert_nueva_tabla"
ON nueva_tabla FOR INSERT
WITH CHECK (shop_id = (auth.jwt() ->> 'shop_id')::uuid);

-- Política UPDATE — solo modificar datos propios
CREATE POLICY "tenant_update_nueva_tabla"
ON nueva_tabla FOR UPDATE
USING (shop_id = (auth.jwt() ->> 'shop_id')::uuid);
```

### Verificación de RLS

Antes de cualquier deploy, ejecutar:
```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```
Confirmar que `rowsecurity = true` en TODAS las tablas.

---

## Manejo de Fechas (Crítico para CDMX)

```typescript
// ✅ Siempre usar timezone explícito
import { formatInTimeZone } from 'date-fns-tz'

const TIMEZONE = 'America/Mexico_City'

// Mostrar fecha al usuario
formatInTimeZone(date, TIMEZONE, 'dd/MM/yyyy HH:mm')

// Guardar en DB — siempre en UTC, Supabase maneja la conversión
const utcDate = new Date(date).toISOString()

// ❌ Nunca usar Date() sin timezone en lógica de negocio
const now = new Date() // ← ambiguo, puede causar bugs de citas
```

---

## Estructura de lib/services/

Cada dominio de negocio tiene su propio archivo de servicio:

```typescript
// lib/services/barbers.ts — patrón a seguir en todos los servicios
import { supabase } from '@/lib/supabase'
import { Barber, CreateBarber } from '@/types'

/**
 * Fetches all active barbers for a given shop.
 * @param shopId - The tenant's shop ID
 * @returns Array of active barbers or throws on error
 */
export async function getBarbers(shopId: string): Promise<Barber[]> {
  const { data, error } = await supabase
    .from('barbers')
    .select('*')
    .eq('shop_id', shopId)
    .eq('is_active', true)
    .order('name')

  if (error) throw new Error(`[getBarbers]: ${error.message}`)
  return data
}
```

---

## API Routes — Patrón Obligatorio

```typescript
// app/api/barbers/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const CreateBarberSchema = z.object({
  name: z.string().min(1),
  commission_rate: z.number().min(0).max(100),
  shop_id: z.string().uuid()
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validated = CreateBarberSchema.parse(body) // Zod valida siempre
    
    // Verificar autenticación y que shop_id coincide con el token
    // ... lógica de negocio
    
    return NextResponse.json({ data: result }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: error.errors },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
```

---

## Tablas Actuales del Proyecto

Respetar nombres exactos al hacer queries — no inventar nombres:

```
shops              → datos del negocio (tenant principal)
barbers            → barberos del negocio
services           → servicios que ofrece la barbería
products           → productos en inventario
sales              → registro de ventas
sale_items         → items de cada venta
cash_movements     → movimientos de caja (⚠️ NO cash_session_movements)
clients            → clientes de la barbería
```

> ⚠️ IMPORTANTE: La tabla se llama `cash_movements`, no `cash_session_movements`.
> Este error ya causó bugs en producción. Verificar el nombre antes de cualquier query.

---

## Testing

```bash
# Antes de cada commit
npx tsc --noEmit    # cero errores de TypeScript
npm run lint        # cero warnings de ESLint
npm run test        # todos los tests pasan
```

Vitest está configurado. Cualquier función en `lib/services/` debe tener al menos
un test básico de happy path.

---

## Lo que NO hacer en este proyecto

```
❌ SQL crudo en el frontend
❌ Queries sin filtro de shop_id
❌ Tablas nuevas sin RLS
❌ any en TypeScript
❌ Secrets hardcodeados
❌ Usar cash_session_movements (tabla que no existe)
❌ Manipular fechas sin timezone explícito
❌ Client Components para queries que pueden ser Server Components
❌ Commits con errores de TypeScript
```
