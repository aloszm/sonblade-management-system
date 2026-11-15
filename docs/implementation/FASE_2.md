# BarberOS — Cierre de la Fase 1 y Fase 2 (cerrada)

> **La Fase 2 quedó cerrada el 15 de noviembre de 2026.** Lo que no se terminó pasó a [`FASE_3.md`](./FASE_3.md), que es la lista de trabajo vigente.

**Fecha:** 15 de noviembre de 2026.
**Para quién:** cualquier persona o sesión nueva que retome el proyecto. Lee esto primero; después `AGENTS.md`, `docs/product/BUSINESS_RULES.md` y `docs/implementation/ROADMAP.md` (decisiones del negocio e historial).

Regla: lo que no aparece en "Subido y verificado" no debe presentarse como funcional.

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Rama de integración (la que se prueba en Vercel) | `feat/v2-integration` |
| Rama con el trabajo paralelo (lint, CI, utilidad real, aviso de privacidad) | `claude/gallant-euler-yuh7gb`; ya contiene `feat/v2-integration` hasta `267e508` |
| Base de desarrollo | Supabase `sonblade-dev` (`zkvikttnpjwzfsygkdot`) |
| Vista previa | Proyecto Vercel `sonblade-management-system` |
| Producción | No existe todavía. `main` sigue en la versión 1 |

**Vercel, importante:** las variables que apuntan a `sonblade-dev` están ligadas solo a la rama `feat/v2-integration`. La vista previa de cualquier otra rama usa las variables globales de la versión 1 y no sirve para probar. Para probar algo en Vercel tiene que estar en `feat/v2-integration`.

## Fase 1 — estado al cierre

### Subido y verificado (tipos, lint, 138 pruebas unitarias y compilación sin errores con ambas ramas unidas)

- Todo lo listado como "Funciona" y los puntos 1 a 6c del ROADMAP.
- Cobro bloqueado con la caja cerrada: avisa, ofrece abrirla y la base lo rechaza con mensaje en español.
- Errores del cobro dentro de la pantalla (ya no como ventana del navegador) y resumen que cabe en pantallas bajas.
- Precio libre por servicio (grecas): se marca en Servicios y se escribe al cobrar, de $1 a $5,000; queda en la bitácora.
- Catálogo real de Gallo 4:20: 11 servicios, 3 paquetes y grecas. Los servicios de demostración quedaron con el sufijo "(prueba)".
- Horario del negocio (Configuración) y horario semanal por barbero (Equipo). La base rechaza citas fuera de horario; un cobro sin cita nunca se bloquea.
- Las pruebas de navegador dejan la caja como la encontraron.
- Lint sin errores.
- Revisión automática en GitHub (`.github/workflows/ci.yml`): tipos, lint, pruebas unitarias y compilación. Las pruebas de navegador no corren ahí porque escriben ventas que no se pueden borrar.
- Pantalla `/administracion` con la utilidad real: ingresos − comisiones − costo de producto − gastos, con margen. Solo dueño y gerente. **No se ha probado en navegador** y **no tiene entrada en el menú**.
- Borrador del aviso de privacidad en `docs/legal/`. **No verificado contra el texto oficial de la ley; no publicar.**

### Marca e íconos

Subidos a `feat/v2-integration` el 15 de noviembre (commit `80ec48d`): marca Gallo 4:20, logo, íconos, acento bronce y prueba automática de contraste. Con esto la Fase 1 queda cerrada.

## Fase 2 — lista de trabajo, en orden sugerido

### A. Cerrar lo que quedó a medias

1. Unir `claude/gallant-euler-yuh7gb` en `feat/v2-integration`.
2. Entrada "Administración" en el menú lateral (`components/Sidebar.tsx`), su título en `components/Header.tsx` y `/administracion` en la lista `adminOnly` de `middleware.ts`.
3. Probar `/administracion` en navegador: dueño, gerente, otro puesto redirigido, modo claro y oscuro, 390 px.
4. Marca, contraste e íconos, si no llegaron.
5. Actualizar el ROADMAP: quitar "32 avisos de lint" y la lista del 14 de noviembre ("14 rutas sin autorización", "12 archivos con el cliente viejo"); ambas cosas ya no aplican.

### B. Dinero y control (cambios de base; un solo responsable a la vez)

6. El retiro del cierre de caja debe registrar a quién se entrega el dinero.
7. La anulación con reembolso en efectivo no debe superar el efectivo en caja.
8. Folio de ticket consecutivo.
9. Guardar el costo del producto en cada venta. Hoy la utilidad usa el costo actual, así que cambiar un costo altera meses pasados.
10. Captura de categoría en gastos. Hoy todos quedan como "General".
11. Borrar las funciones `*_legacy` sin permisos.
12. Quien autoriza un descuento debe confirmarlo (se resuelve con el PIN, punto 18).

### C. Funciones nuevas del ROADMAP

13. Vista personal del horario del barbero en celular (resto del punto 7).
14. Página de reservas para clientes (punto 8). Requiere el aviso de privacidad revisado.
15. Barbero confirma el servicio y recepción solo cobra (punto 9, opcional).
16. Apartados tipo sobres (resto del punto 10).
17. Historial por cliente, familiares a cargo y reglas de puntos (punto 11).
18. Cuentas con nombre y PIN de 6 dígitos y alta de personal desde la app (punto 13). Requiere `SUPABASE_SERVICE_ROLE_KEY` como variable sensible en Vercel.
19. Metas de comisión como bono semanal (punto 12).

### D. Calidad y seguridad

20. Pruebas de permisos y de RLS (hoy las pruebas son de componentes y de lógica).
21. Encender la protección contra contraseñas filtradas en Supabase Auth.
22. El acceso dice "revisa tus credenciales" aunque el problema sea de conexión.
23. Si recepción cobra sin abrir la cita desde la agenda, queda una cita abierta y un registro "sin cita" duplicado.
24. Pruebas de navegador automáticas: necesitan una base aparte que se pueda reiniciar.
25. Dato de prueba: cuatro ventas de Pomada mate del 1 al 6 de noviembre no tienen comisión.

### E. Producción (punto 14; cada paso con aprobación expresa del dueño)

26. Base nueva y limpia en plan Pro, datos reales, variables de Vercel y nombres unificados en GitHub, Vercel y Supabase.

### F. Legal

27. Aviso de privacidad: verificar la ley vigente en el Diario Oficial y que lo revise un abogado. Datos que debe dar el dueño: responsable (nombre o razón social), contacto para solicitudes de privacidad, si se guarda correo del cliente, qué datos del personal se guardan, uso para promociones o WhatsApp, terceros con los que se comparten datos y si se podrá reservar para menores.

## Comentarios y decisiones del dueño (15 de noviembre de 2026)

Esto es lo prioritario de la Fase 2, antes que el resto de la lista.

1. **Productos reales.** Comisión de 20 % en todos.

   | Producto | Costo | Precio de venta |
   |---|---|---|
   | Pomada Negra Baregk (150 ml) | $45 | $180 |
   | Pomada Roja Baregk (150 ml) | $45 | $180 |
   | Peine de textura | $27 | $80 |
   | Polvo de textura | $115 | $225 |

   Confirmado por el dueño: la marca de las pomadas es Baregk y las existencias iniciales quedan en 0.
2. **Propinas.** Son 100 % del barbero. No son ingreso del negocio y no se restan de la utilidad; se muestran aparte.
3. **Reporte financiero.** El reporte actual muestra lo facturado y las comisiones, pero no desglosa propinas ni utilidad neta. Debe ser un reporte de balance y financiero: completo, claro, entendible y que no aburra.
4. **Folios más cortos y con sentido.** El del ticket de venta es demasiado largo y uno como `A0001` es demasiado básico. Formato elegido (se puede cambiar antes de producción):
   - Ticket de venta: `V2611-0042` = venta, año 26, mes 11, número 42 del mes.
   - Comprobante de pago al equipo: `P2646-03` = pago, año 26, semana 46, número 3 de esa semana.
5. Lo demás de la lista sigue sin comentarios, en el orden escrito.
6. El dueño tiene más pendientes nuevos por dictar.

## Avance de la Fase 2 al 15 de noviembre de 2026 (noche)

Subido a `feat/v2-integration`. Verificado con tipos, lint, pruebas unitarias y compilación, y con pruebas SQL revertidas en la base de desarrollo. **Nada de esto se ha probado en navegador con sesión iniciada.**

- **Folio del ticket de venta** `V2611-0042`: columna `sales.folio`, consecutivo por mes, asignado dentro del cobro; un reintento devuelve el mismo folio. Las 70 ventas existentes quedaron numeradas. (Cierra el punto 8.)
- **Folio del comprobante de pago** `P2646-03`: año y semana ISO del sábado final del periodo. Los recibos `LIQ-…` ya emitidos conservan su número.
- **Productos reales** cargados con costo y precio; los de demostración quedaron como "(prueba)". Existencias en 0.
- **Costo guardado en cada venta** (`sale_items.unit_cost_snapshot`); Finanzas y el reporte lo usan. Las ventas anteriores al 15 de noviembre tienen el costo de ese día. (Cierra el punto 9.)
- **Cierre de caja**: campo opcional "¿A quién se entrega el retiro?" (`cash_sessions.withdrawal_delivered_to`). (Cierra el punto 6.)
- **Anulación**: no puede devolver más efectivo del que hay en caja. (Cierra el punto 7.)
- **Funciones `*_legacy`** borradas (seis). (Cierra el punto 11.)
- **Finanzas** (`/administracion`, antes "Utilidad"): utilidad neta, cascada, a dónde va cada $100, tendencia por día, propinas por barbero y método, resultado por barbero, cobros por método y vista de impresión. (Cierra los puntos 2 y 3 de la sección A, salvo la prueba en navegador.)
- **Reporte completo** (PDF, Excel y pantalla): cuatro secciones nuevas — resultado del periodo, propinas, lo que deja cada persona y balance de efectivo. Pasa de 10 a 14 secciones.
- **Acceso**: distingue contraseña incorrecta, demasiados intentos y falla de conexión. (Cierra el punto 22.)

Decisiones tomadas por los agentes, por confirmar con el dueño:

- "Lo que deja cada persona" = lo que vendió − sus comisiones − el costo de los productos que vendió, antes de gastos generales.
- En el balance de efectivo, los pagos al equipo cuentan en el periodo en que se pagaron. Retiros y apartados van aparte porque no son gasto.
- El resultado usa la fecha del gasto; la sección "Gastos" del reporte usa la fecha de registro.

Siguiente, en este orden: probar todo lo anterior en navegador (dueño, gerente, recepción, barbero); captura de categoría en gastos (punto 10); confirmación del descuento con PIN (puntos 12 y 18); y la sección C.

## Decisiones abiertas del dueño

- Datos para el aviso de privacidad (punto 27).
