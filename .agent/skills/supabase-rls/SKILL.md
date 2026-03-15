# SKILL.md — Supabase RLS Policy Generator
# Archivo: sonblade-management-system/.agent/skills/supabase-rls/SKILL.md
# Tipo: Skill bajo demanda (se activa automáticamente cuando es relevante)

---

## Cuándo activar este Skill

Activar cuando el usuario mencione cualquiera de estas palabras o contextos:
- "tabla nueva", "crear tabla", "nueva tabla", "migración"
- "RLS", "Row Level Security", "política", "policy"
- "multi-tenant", "aislamiento", "tenant", "shop_id"
- "permisos", "acceso", "seguridad de datos"
- "Supabase" + cualquier operación de base de datos

---

## Contexto del Proyecto

Este skill es específico para **Sonblade**, un SaaS multi-tenant donde:
- Cada barbería es un tenant identificado por `shop_id` (UUID)
- El `shop_id` del usuario viene en el JWT como claim: `auth.jwt() ->> 'shop_id'`
- RLS es la barrera de seguridad principal entre tenants

---

## Procedimiento Completo para Tabla Nueva

### Paso 1 — Crear la tabla con tipos correctos

```sql
CREATE TABLE nombre_tabla (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  -- tus columnas aquí --
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

> `shop_id` es OBLIGATORIO en TODA tabla nueva. Es el identificador del tenant.

### Paso 2 — Habilitar RLS

```sql
ALTER TABLE nombre_tabla ENABLE ROW LEVEL SECURITY;
```

### Paso 3 — Crear las 4 políticas básicas

```sql
-- SELECT: solo ver datos del propio tenant
CREATE POLICY "tenant_select_nombre_tabla"
ON nombre_tabla FOR SELECT
USING (shop_id = (auth.jwt() ->> 'shop_id')::uuid);

-- INSERT: solo insertar en propio tenant
CREATE POLICY "tenant_insert_nombre_tabla"
ON nombre_tabla FOR INSERT
WITH CHECK (shop_id = (auth.jwt() ->> 'shop_id')::uuid);

-- UPDATE: solo modificar datos propios
CREATE POLICY "tenant_update_nombre_tabla"
ON nombre_tabla FOR UPDATE
USING (shop_id = (auth.jwt() ->> 'shop_id')::uuid)
WITH CHECK (shop_id = (auth.jwt() ->> 'shop_id')::uuid);

-- DELETE: solo eliminar datos propios
CREATE POLICY "tenant_delete_nombre_tabla"
ON nombre_tabla FOR DELETE
USING (shop_id = (auth.jwt() ->> 'shop_id')::uuid);
```

### Paso 4 — Índice de performance (obligatorio)

```sql
-- Sin este índice, cada query filtra por shop_id en toda la tabla = lento
CREATE INDEX idx_nombre_tabla_shop_id ON nombre_tabla(shop_id);
```

### Paso 5 — Trigger de updated_at

```sql
-- Mantener updated_at automáticamente
CREATE TRIGGER set_updated_at_nombre_tabla
  BEFORE UPDATE ON nombre_tabla
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();
```

### Paso 6 — Verificar antes de terminar

```sql
-- Confirmar RLS activado en la tabla nueva
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename = 'nombre_tabla';
-- Debe retornar: rowsecurity = true

-- Confirmar que las políticas existen
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'nombre_tabla';
-- Debe mostrar las 4 políticas: SELECT, INSERT, UPDATE, DELETE
```

---

## Paso 7 — Crear el tipo TypeScript correspondiente

```typescript
// types/nombre-tabla.ts

/**
 * Represents a [descripción] record in the database.
 * RLS enforced: only accessible by the owning shop tenant.
 */
export interface NombreTabla {
  id: string
  shop_id: string
  // tus campos aquí
  created_at: string
  updated_at: string
}

export interface CreateNombreTabla
  extends Omit<NombreTabla, 'id' | 'created_at' | 'updated_at'> {}

export interface UpdateNombreTabla
  extends Partial<Omit<NombreTabla, 'id' | 'shop_id' | 'created_at' | 'updated_at'>> {}
```

---

## Casos Especiales

### Admin global (dueño de Weia, no de la barbería)

Si necesitas una query que bypasee RLS para administración:
```sql
-- SOLO en operaciones administrativas del sistema, nunca en frontend
-- Usar service_role key en API route protegida
SET LOCAL role = 'service_role';
```

### Barber flotante (Tier 3 — multi-sucursal)

```sql
-- Política especial para barbers que trabajan en múltiples shops
CREATE POLICY "multi_shop_barber_select"
ON barbers FOR SELECT
USING (
  shop_id = (auth.jwt() ->> 'shop_id')::uuid
  OR id = (auth.jwt() ->> 'barber_id')::uuid
);
```

---

## Checklist Final Antes de PR

```
[ ] Tabla tiene columna shop_id NOT NULL
[ ] RLS habilitado: ALTER TABLE ... ENABLE ROW LEVEL SECURITY
[ ] 4 políticas creadas: SELECT, INSERT, UPDATE, DELETE
[ ] Índice en shop_id creado
[ ] Trigger updated_at configurado
[ ] Verificación SQL corrió sin errores
[ ] Tipo TypeScript creado en /types
[ ] Servicio en lib/services/ creado con JSDoc
[ ] Al menos 1 test básico en Vitest
```
