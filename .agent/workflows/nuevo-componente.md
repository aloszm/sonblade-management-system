# Workflow: Nuevo Componente React
# Archivo: sonblade-management-system/.agent/workflows/nuevo-componente.md
# Activar con: /nuevo-componente en el chat de Antigravity

---

## Uso

```
/nuevo-componente NombreDelComponente [descripción breve]

Ejemplos:
/nuevo-componente CommissionCard tarjeta de comisión del barbero
/nuevo-componente CashClosingForm formulario de cierre de caja
/nuevo-componente BarberStatsChart gráfica de estadísticas del barbero
```

---

## Pasos que el Agente Ejecuta

### 1. Crear estructura de carpetas

```bash
mkdir -p components/NombreComponente
```

### 2. Crear NombreComponente.types.ts

```typescript
// components/NombreComponente/NombreComponente.types.ts

export interface NombreComponenteProps {
  // props con tipos explícitos
  // sin any, sin optional innecesarios
}
```

### 3. Crear useNombreComponente.ts (lógica separada del JSX)

```typescript
// components/NombreComponente/useNombreComponente.ts
'use client' // solo si necesita hooks

import { useState } from 'react'
import { NombreComponenteProps } from './NombreComponente.types'

export function useNombreComponente(props: NombreComponenteProps) {
  // toda la lógica aquí
  // el componente JSX no debe tener lógica de negocio
  return {
    // solo lo que el JSX necesita
  }
}
```

### 4. Crear NombreComponente.tsx (solo JSX + Tailwind)

```typescript
// components/NombreComponente/NombreComponente.tsx
import { NombreComponenteProps } from './NombreComponente.types'
import { useNombreComponente } from './useNombreComponente'

export function NombreComponente(props: NombreComponenteProps) {
  const { /* valores del hook */ } = useNombreComponente(props)

  return (
    <div className="...tailwind classes...">
      {/* JSX limpio, sin lógica de negocio */}
    </div>
  )
}
```

**Límite:** Si el JSX supera 150 líneas, dividir en subcomponentes antes de continuar.

### 5. Crear index.tsx (exportación pública)

```typescript
// components/NombreComponente/index.tsx
export { NombreComponente } from './NombreComponente'
export type { NombreComponenteProps } from './NombreComponente.types'
```

### 6. Verificaciones obligatorias antes de terminar

```bash
# 1. Cero errores de TypeScript
npx tsc --noEmit

# 2. El componente importa correctamente desde la raíz
# import { NombreComponente } from '@/components/NombreComponente'

# 3. No usa any en ningún lugar
grep -r "any" components/NombreComponente/
```

### 7. Reglas de Tailwind v4 para Sonblade

- Mobile-first siempre: base → `sm:` → `md:` → `lg:`
- Colores consistentes con el design system de Sonblade
- Animaciones con Framer Motion para transiciones, no con Tailwind animate
- Usar `lucide-react` para todos los iconos, nunca SVGs inline

---

## Checklist Final

```
[ ] Carpeta components/NombreComponente/ creada
[ ] NombreComponente.types.ts con props tipadas
[ ] useNombreComponente.ts con lógica separada
[ ] NombreComponente.tsx solo con JSX (< 150 líneas)
[ ] index.tsx con exportación limpia
[ ] npx tsc --noEmit pasa sin errores
[ ] Importable con: import { NombreComponente } from '@/components/NombreComponente'
[ ] Sin any en ningún archivo
[ ] Mobile-first con Tailwind
```
