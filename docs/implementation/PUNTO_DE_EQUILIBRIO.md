# Módulo "Punto de equilibrio" — plan (sin aprobar, sin empezar)

> Redactado el 20 nov 2026 a petición del dueño. No se ejecuta hasta que él lo apruebe.
> Lo construyen agentes (Opus la base, Sonnet la pantalla, Haiku la documentación); el agente principal
> solo coordina, integra y verifica. Reglas: `AGENTS.md` y `FASE_4.md` §0.2 y §5.2.

## 1. Para qué

Que el dueño vea, cualquier día del mes, cuánto falta para que la barbería cubra sus costos fijos y a partir de
qué momento lo que entra ya es ganancia. Debe leerse fácil y **motivar, no presionar**.
Es además el prototipo de una idea mayor del dueño (costeo y punto de equilibrio para otros giros).

## 2. Las cuentas (una sola definición, en la base)

- **Costos fijos del mes** = plantillas de gastos fijos activas (`recurring_expenses`: renta, luz, internet,
  limpieza, abono de préstamo del negocio…) + sueldos por día de recepción del mes (`employee_wage_rates`,
  mismos días que usa el pago semanal).
- **Lo que deja la operación** (margen) = ingreso sin propinas − comisiones − costo de producto.
  Son los mismos datos y la misma fórmula de la utilidad (`report_financial_period`); no se crea otra.
- **Meta del mes en pesos** = costos fijos ÷ (margen ÷ ingreso del periodo de referencia).
- **"Cortes"** es solo una traducción amable: meta en pesos ÷ lo que deja un servicio promedio. Se muestra como
  "unos 320 cortes", nunca como cifra exacta, porque no todos los servicios dejan lo mismo.
- **Periodo de referencia** para los promedios: los últimos 28 días con ventas. Con menos de 14 días de datos la
  pantalla lo dice ("Aún estamos aprendiendo tu ritmo") y no inventa promedio.

## 3. La pantalla (Finanzas → "Punto de equilibrio")

Tono: logros que se van cumpliendo, no una deuda. Nada en rojo antes del día 25; nunca "vas mal".

1. **Arriba, un solo mensaje grande** que cambia con el avance:
   "Llevas cubierto el 66 % del mes" → "Te faltan unos 108 cortes para cubrir todo" →
   al llegar: "¡Mes cubierto el día 19! Todo lo de aquí en adelante es ganancia: llevas $X".
2. **Cubetas que se llenan en orden**: Renta ✔ · Luz ✔ · Internet ✔ · Sueldos (llenándose) · Limpieza · Préstamo.
   Cada una con su monto y una barra. El orden lo decide el dueño (por omisión, de mayor a menor).
3. **"De cada $100 que entran"**: tanto a barberos, tanto a producto, tanto a renta, luz…, y lo que queda.
4. **Ritmo**: "Para cubrir el mes necesitas unos 11 cortes al día; esta semana vas en 13." Comparación contra el
   propio promedio, no contra una meta impuesta.
5. **"¿Y si…?"** (opcional, segunda versión): mover precio de un servicio o agregar un gasto fijo y ver cómo
   cambia la meta. Solo calcula; no guarda nada.
6. Animación ligera (barras que se llenan, solo `transform`/`opacity`, respeta movimiento reducido); en celular
   primero.

Quién lo ve: cuenta principal, gerencia y consulta. Recepción y barberos, no (muestra costos del negocio).
Variante futura a decidir: un tablero para el equipo solo con porcentaje ("vamos al 66 % del mes"), sin montos.

## 4. Qué se toca

| Capa | Cambio | Riesgo |
|---|---|---|
| Base | 1 migración: función de **solo lectura** `break_even_period(sucursal, mes)` para owner/admin/viewer; columna de orden en `recurring_expenses` (para las cubetas) | Bajo: no escribe dinero ni cambia cálculos existentes |
| API | 1 ruta de lectura `GET /api/break-even` | Bajo |
| Pantalla | Sección nueva en Finanzas y un resumen de una línea en el Panel | Bajo |
| Datos | El dueño captura sus gastos fijos reales como plantillas (hoy no hay ninguna) | Sin esto la pantalla sale vacía |

No se tocan cobro, caja, comisiones, pago semanal ni la fórmula de utilidad.

## 5. Permisos y aprobaciones que se necesitan del dueño

1. Aprobar este plan.
2. Capturar (o dictar) sus gastos fijos: concepto, monto mensual y día de pago.
3. Decidir: ¿los abonos de un préstamo del negocio cuentan como fijo? (propuesta: sí, como plantilla "Préstamo").
4. Decidir el orden de las cubetas y si el equipo verá la variante sin montos.
5. Visto bueno expreso para replicar la migración a producción y publicar (como siempre: base primero).
No se necesitan llaves ni accesos nuevos.

## 6. Quién hace qué

| Paso | Agente | Qué | Tiempo aprox. |
|---|---|---|---|
| 1 | **Opus** | Migración y función de lectura en desarrollo, con `supabase/tests/break_even.test.sql`: coincide con `report_financial_period`; mes sin datos; mes parcial; sin plantillas; sueldos a mitad de mes; permisos por puesto | 1 h |
| 2 | **Sonnet** | Ruta, pantalla, animación, estados vacíos ("Captura tus gastos fijos para empezar"), Vitest y prueba de navegador en práctica con capturas en celular y computadora | 1.5 a 2 h |
| 3 | **Haiku** | `docs/GLOSARIO.md` (punto de equilibrio, costo fijo, margen), `FASE_4.md` y este archivo | 15 min |
| 4 | Principal | Integrar, `tsc`, lint, pruebas, build; mostrar capturas al dueño; con su visto bueno, base y luego código | 30 min |

## 7. Lo que hay que decir con honestidad

- Con 0 ventas reales no hay promedios: conviene construirlo cuando haya 2 o 3 semanas de uso, o construirlo ya
  y aceptar que al principio dirá "aún estamos aprendiendo tu ritmo".
- Es una **estimación**: precios variables (grecas), productos y temporadas mueven el número.
- Los gastos no fijos (compras ocasionales) no entran en la meta; sí en la utilidad de Finanzas. La pantalla lo
  aclara para que no haya dos "ganancias" distintas sin explicación.
- Si los gastos fijos no se mantienen al día, la meta miente.

## 8. Verificación

Prueba SQL contra la fórmula de utilidad; Vitest de estados y redondeos; prueba de navegador en práctica con la
semana simulada; revisión de capturas en celular; contraste AA; que recepción y barberos reciban 403.
