# Fase 5 — Manual, presentaciones y tutorial de BarberOS (Gallo 4:20)

> **Estado: planeada, sin empezar.** Redactada el 20 nov 2026 a petición del dueño para ejecutarse después.
> Quien la ejecute debe leer primero `AGENTS.md` y `docs/implementation/FASE_4.md` (reglas §0.2, estado §8b a §8f).
> Esta fase **no cambia el sistema**: produce material para personas. Si al prepararlo se descubre un defecto,
> se anota en la sección 9 y se corrige aparte, con las reglas de la Fase 4.

## 0. Para qué existe esta fase

El sistema ya está construido y publicado, pero nadie del equipo lo ha usado en producción (0 ventas al 20 nov).
El dueño pidió material para tres necesidades distintas:

1. **Saber qué tenemos**: un manual de referencia que diga qué abarca el programa, qué funciona, qué está
   oculto pero funciona, qué tiene la base hecha pero no está terminado, y hasta dónde se puede explotar.
2. **Explicarlo a cada público**: dirección y contador; barberos y recepción; y una presentación del propio
   dueño sobre la visión, cómo se construyó, tiempos, métricas y límites.
3. **Enseñar a usarlo**: un tutorial visual hecho con HTML y JS.

Resultado esperado: el equipo empieza a cobrar en producción con una referencia clara, y el dueño puede
mostrar el proyecto a terceros sin exagerar ni quedarse corto.

## 1. Entregables

| # | Entregable | Público | Formato | Dónde queda |
|---|---|---|---|---|
| E1 | Manual de referencia | Dueño, gerencia, contador | PDF con capturas (20 a 35 páginas) | `docs/manual/manual-barberos.pdf` + fuente |
| E2 | Presentación de dirección | Alonso, Sonia, Lucía, contador | Enlace + PowerPoint + PDF (12 a 15 láminas) | Enlace y `docs/presentaciones/` |
| E3 | Presentación del equipo | Barberos y recepción | Enlace + PowerPoint + PDF (8 a 10 láminas) | Igual |
| E4 | Presentación de negocio del dueño | Alonso, y a quien él la muestre | Enlace + PowerPoint + PDF (15 a 18 láminas) | Igual |
| E5 | Tutorial animado | Todo el equipo | Página HTML + JS autónoma; opcional video `.webm`/`.mp4` | `docs/tutorial/` y enlace |
| E0 | Banco de capturas | Insumo de todo lo anterior | PNG por puesto, computadora y celular | Fuera del repo (ver §3) |

Decisiones ya tomadas por el dueño (20 nov): presentaciones en **enlace + PowerPoint/PDF**; el proyecto
**empezó en octubre de 2026**; los PIN temporales de práctica **no se han repartido** (se pueden usar las
cuentas para capturas y al final se entrega un archivo nuevo de PIN).

## 2. Reglas de esta fase

1. **La verdad primero.** Nada de cifras inventadas. En producción hay 0 ventas: toda cifra de negocio que se
   muestre viene de la **semana simulada de práctica** y se rotula "datos de ensayo". Las métricas de
   construcción (migraciones, pruebas, rutas) se toman del repositorio el día que se ejecute, con el comando
   que las produjo anotado al pie.
2. **Capturas solo de práctica** (`practica.barbergallo420.site` o servidor local contra desarrollo). Nunca de
   producción. La franja "MODO PRÁCTICA" puede verse; no se recorta para simular que es real.
3. **Sin datos personales reales** en ningún entregable: clientes ficticios "Prueba …"; del equipo solo nombres
   de pila (alonso, sonia, lucia, deya, dani, dago, emi). Ningún teléfono real de clientes.
4. **Nunca aparecen PIN, llaves ni el pepper** en capturas, láminas, manual o tutorial. La pantalla de acceso se
   captura vacía o con el PIN oculto.
5. **Cuatro estados, siempre con la misma etiqueta y color** en todos los entregables (ver §4.2):
   En uso · Listo pero apagado u oculto · Base hecha, sin terminar · No existe todavía.
6. **Español de México, sin jerga técnica** en E3 y E5. En E1, E2 y E4 se permite un glosario corto.
7. Los títulos internos de puesto ("Gerente Barbera") no se muestran en material para clientes; en material
   interno sí.
8. Lo que se suba al repositorio no incluye capturas con datos sensibles; los PDF y las fuentes sí se versionan.

## 3. Paso previo: banco de capturas (E0)

### 3.1 Acceso
- Cuentas de práctica: `alonso` (cuenta principal; **no tocar su PIN**: ya lo cambió), y para capturas
  `sonia`, `deya`, `dago`, `lucia`. Se les asigna PIN de prueba temporal con la receta de `FASE_4.md`
  (sección "Verificación en navegador": llave secreta temporal de `sonblade-dev`, PIN aleatorios guardados
  solo en el área temporal, nunca impresos). Al terminar: borrar la llave, `must_change_pin = true`, borrar
  sesiones, y **entregar al dueño un archivo nuevo de PIN temporales** para todo el equipo menos él.
- **Ojo con los puestos en práctica:** al 20 nov `sonia` y `lucia` tienen puesto de cuenta principal en práctica
  (decisión temporal del dueño). Para capturar lo que verán en producción (gerencia y consulta) hay dos caminos:
  pedir al dueño regresarlas a su puesto real, o cambiarlas solo durante la sesión de capturas y devolverlas
  como estaban. Preguntar antes; no cambiarlo por cuenta propia.
- Herramientas: `e2e/README.md` y los scripts descritos ahí (compilar en modo práctica, levantar en el puerto
  3100, Playwright con 1 trabajador). Un solo agente de navegador a la vez: la base gratuita se satura.

### 3.2 Qué capturar
Cada pantalla en **computadora (1440 px)** y **celular (iPhone 13)**, tema oscuro; tema claro solo para la
portada pública y la página de citas. `deviceScaleFactor: 2`. Nombre de archivo: `<puesto>-<pantalla>-<equipo>.png`.

| Puesto | Pantallas |
|---|---|
| Público (sin sesión) | Portada completa y por secciones; citas paso 1 a 4 y "Listo"; "Ver o cancelar mi cita"; aviso de privacidad |
| Recepción (dago) | Acceso; Cobro vacío y con venta; cobro desde una cita con productos y vendedor; Caja abierta, movimiento, cierre guiado; Agenda día y semana; detalle de cita con WhatsApp y productos; agregar producto ("¿Quién lo vendió?"); Recordatorios de mañana; Clientes y ficha; Barberos hoy; Inventario (entrada); Mi semana |
| Barbera (deya) | Agenda propia; detalle de su cita; agregar producto; Mi semana |
| Gerencia (sonia, puesto real) | Panel; Pago semanal con desglose y sueldo; registrar falta; recibo imprimible; Ventas; Cuadre; Finanzas; Gastos (lista, formulario, visor de comprobante); Sobres; Inventario; Servicios; Equipo; Reportes; Bitácora; Reservas en línea (solo lectura) |
| Cuenta principal (alonso) | Configuración; Reservas en línea (interruptor); Equipo → sueldo; Estado del sistema; Administración (cascada de utilidad) |
| Consulta (lucia, puesto real) | Panel, Finanzas, Ventas, Reportes: lo que ve y lo que no |

### 3.3 Datos de ensayo
Antes de capturar, práctica debe verse como una barbería viva: correr la semana simulada pendiente
(`scripts/simulate-week.mjs --week <semana> --day N`, ver `FASE_4.md`), dejar una caja abierta con ventas del
día, 6 a 8 citas en la agenda de hoy y de mañana, un gasto con comprobante visible y un adelanto registrado.
Al terminar: caja cerrada, sobre "Renta y gastos" en $600, sin excepciones de asistencia ni metas activas
(mismo estado final que piden las pruebas).

### 3.4 Dónde se guardan
Fuera del repositorio mientras se trabaja. Al repositorio solo entran las imágenes ya incrustadas en los
entregables. Existe un banco anterior de más de 500 capturas (19 y 20 nov) que **no sirve como fuente
principal**: varias pantallas cambiaron después (Pago semanal, Mi semana, Gastos, agenda).

## 4. E1 — Manual de referencia

### 4.1 Estructura
1. **Portada y cómo leer este manual** (los cuatro estados, glosario de 10 términos).
2. **Qué es BarberOS en una página**: una barbería, tres direcciones web, cinco puestos.
3. **Mapa del sistema**: diagrama de las tres direcciones (`barbergallo420.site`, `citas.`, `admin.`) y `practica.`.
4. **Quién ve qué**: tabla de puestos contra pantallas (cuenta principal, gerencia, consulta, recepción, barbero).
5. **Módulos**, uno por sección, cada uno con: para qué sirve · quién lo usa · captura · cómo se usa en 3 a 6
   pasos · reglas de dinero que aplica · estado (una de las cuatro etiquetas) · límites conocidos.
   - Acceso y PIN (usuario + PIN, PIN temporal, bloqueo por intentos).
   - Cobro (servicios, productos, propina, descuento con PIN, pago dividido, anulación con PIN).
   - Caja (apertura, movimientos con motivo, cierre guiado, apartado diario).
   - Agenda (cita con servicios, reprogramar, "sin cita", productos en la cita con vendedor, WhatsApp de un clic,
     recordatorios de mañana, etiqueta "En línea").
   - Clientes (ficha, historial, notas, privacidad).
   - Comisiones y pago semanal (50 % servicio, 20 % producto al vendedor, propinas completas, adelantos,
     préstamos, descuentos, bonos por metas, sueldo por día de recepción, faltas y días extra, recibo).
   - Gastos y sobres (categorías, sobre o banco, comprobante, cancelación con PIN, gastos fijos, saldo del sobre).
   - Inventario (existencias, mínimos, entradas por recepción, costo oculto a recepción).
   - Finanzas, Panel y Administración (una sola fórmula de utilidad; qué resta y cuándo).
   - Cuadre (agenda contra cobros).
   - Reportes y verificación de folio; reporte para el contador.
   - Bitácora (quién hizo qué).
   - Página pública y reservas en línea (interruptor con PIN, límites, cancelación por enlace).
   - Práctica (qué es, en qué se parece y en qué no a producción).
6. **Lo que funciona pero está apagado u oculto** (lista única, con cómo se enciende y quién decide).
7. **Lo que tiene la base hecha y falta terminar.**
8. **Lo que no existe todavía.**
9. **Hasta dónde se puede explotar**: capacidades reales (varias sucursales en el modelo de datos, respaldo
   semanal, plan gratuito y sus límites, qué pasaría al crecer).
10. **Riesgos y pendientes honestos**: respaldo nunca restaurado, aviso de privacidad sin abogado, Safari sin
    probar, base gratuita que se pausa sin visitas, 0 uso real.
11. **Qué hacer si…**: olvidé mi PIN, la caja no cuadra, cobré mal, se cayó el internet, llegó una reserva.
12. **Anexos**: direcciones, a quién llamar, cómo pedir un cambio (sección 8 de este documento).

### 4.2 Las cuatro etiquetas (fuente: `FASE_4.md` §8b a §8f; verificar el día de ejecución)
- **En uso (publicado y encendido):** cobro, caja, agenda, clientes, comisiones, pago semanal con adelantos y
  sueldo, gastos y sobres, inventario, finanzas, cuadre, reportes, bitácora, página pública, reservas en línea,
  WhatsApp de un clic, productos en la cita, interruptor de reservas, separación por dominios, práctica.
- **Listo pero apagado u oculto:** recibos de pago para barberos y recepción (ocultos por decisión del 20 nov;
  se devuelven en `lib/auth/roles.ts`, `canSeePayReceipts`); metas de bono (construidas, ninguna configurada);
  gastos fijos del mes (plantillas sin cargar); ocultar datos de ensayo de práctica (script sin ejecutar).
- **Base hecha, sin terminar:** reprogramar desde el enlace del cliente; métricas de agenda (ocupación,
  retención, faltas); cierre a nivel de base de la lectura de recibos propios; restringir a recepción las
  comisiones ajenas (hoy visibles por "Barberos hoy", decisión del dueño: se queda así).
- **No existe todavía:** número de cliente, puntos (1 por cada $10), referidos, cuenta de cliente con Google,
  comisión de terminal de tarjeta, compras de inventario con costo, reembolso parcial, facturación (CFDI),
  WhatsApp automático (requiere el servicio de pago de Meta), anticipos en reservas.

### 4.3 Producción
Fuente en HTML + CSS de impresión dentro de `docs/manual/` (misma tipografía y colores de marca: Playfair
Display e Inter, dorado sobre oscuro para portadas, fondo claro para páginas de lectura), convertido a PDF con
Chromium (`page.pdf`, tamaño carta, márgenes de 18 mm, encabezado con sección y pie con página y fecha).
Revisar el PDF página por página antes de entregarlo: ninguna captura cortada, ningún texto encimado.

## 5. Presentaciones

Regla común: una idea por lámina, una captura grande o un número grande, máximo 30 palabras. Cada presentación
termina con "Qué sigue" y "A quién preguntarle". Se construyen después del manual, porque salen de él.

### 5.1 E2 — Dirección (Alonso, Sonia, Lucía, contador)
1. Qué problema resuelve (quién cobra, cuánto entra, cuánto sale, cuánto se le paga a cada quien).
2. El sistema en una lámina (tres direcciones, cinco puestos).
3. El día completo en dinero: apertura → cobros → movimientos → cierre → sobre.
4. Cómo se calcula la utilidad (una sola fórmula; lista de lo que resta).
5. Pago semanal: comisión, propina, sueldo, adelantos, descuentos; ejemplo de un recibo.
6. Gastos y comprobantes; sobre "Renta y gastos".
7. Controles: PIN para descuento, anulación, movimientos, faltas; bitácora; el dinero nunca se borra.
8. Quién ve qué (tabla de puestos); qué ve el contador y qué no (sin datos de clientes).
9. Reportes para el contador y verificación de folio.
10. Reservas en línea y WhatsApp: qué es automático y qué no.
11. Privacidad: qué datos se guardan y para qué.
12. Riesgos y pendientes (los de §4.1.10, sin maquillar).
13. Qué decide dirección en las próximas cuatro semanas.
14. Qué sigue.

### 5.2 E3 — Equipo (barberos y recepción)
Tono: directo, de compañero a compañero; cero tecnicismos; todo con capturas de celular.
1. Por qué cambiamos (menos cuentas a mano, pagos claros).
2. Cómo entro: dirección, usuario, PIN; qué hago si lo olvido.
3. Barbero: mi agenda, agregar un producto a mi cita, mi semana.
4. Recepción: agendar, cobrar, caja, WhatsApp de un clic.
5. Cómo se me paga: 50 % servicio, 20 % producto a quien lo vendió, propinas completas; recepción además $320
   por día trabajado. Ejemplo con números redondos.
6. Qué veo de mi dinero hoy (lo que llevo ganado) y qué no (el recibo lo entrega gerencia, por ahora).
7. Reglas que nos cuidan a todos: PIN personal, todo queda registrado, sin cita también se anota.
8. Dónde practicar sin miedo: `practica.barbergallo420.site`.
9. A quién le pregunto.

### 5.3 E4 — Negocio, la del dueño
1. La barbería y el punto de partida (desde 2016; cómo se llevaba el control antes).
2. La visión: qué quería poder contestar cualquier noche en un minuto.
3. Qué se construyó (mapa del sistema).
4. Cómo se construyó: dueño + asistente de IA, por fases; el dueño decide el negocio, la IA propone, construye
   y prueba; nada llega a producción sin su visto bueno.
5. Línea de tiempo: octubre 2026 (inicio, fases 1 a 3) → noviembre 2026 (fase 4, publicación y dominio).
   **Pendiente de dato:** fechas exactas de las fases 1 a 3 (el historial de este repositorio es parcial; tomarlas
   de `FASE_2.md`, `FASE_3.md` y de lo que diga el dueño).
6. Métricas de construcción (tomar el día de ejecución y anotar el comando): migraciones aplicadas (89 al
   20 nov), pruebas unitarias (1,510), pruebas de navegador (25 archivos), puntos de servicio (83), archivos de
   código (≈500), costo mensual de infraestructura (plan gratuito).
7. Lo que hace especial al sistema: permisos en la base, PIN en cada movimiento de dinero, libros de dinero que
   no se borran, una sola utilidad, práctica separada.
8. Qué se puede hacer hoy (lista corta con capturas).
9. Qué no se puede hacer y por qué (los "No existe todavía").
10. Qué cuesta mantenerlo y qué pasaría al crecer (planes de pago, segunda sucursal).
11. Lecciones: verificar en navegador antes de publicar (el caso del comprobante), decidir reglas de dinero
    antes de programar, publicar poco y seguido.
12. Resultados de negocio: **vacío honesto**. Lámina que diga "se medirá tras las primeras 4 semanas de uso"
    con los indicadores que se van a seguir (ticket promedio, ocupación, faltas, utilidad semanal, diferencias
    de caja). No inventar cifras.
13. Hoja de ruta: número de cliente, puntos, referidos, terminal de tarjeta, compras de inventario.
14. Cierre.

**Insumo que solo el dueño tiene:** tres o cuatro frases suyas sobre por qué empezó y qué le dolía. Pedírselas
antes de redactar las láminas 1, 2 y 11.

### 5.4 Producción de las presentaciones
Usar la herramienta de presentaciones de la sesión (enlace compartible que se descarga como PowerPoint o PDF).
Guardar además copia de cada PDF en `docs/presentaciones/`. Misma identidad visual que el manual.

## 6. E5 — Tutorial animado (HTML + JS)

### 6.1 Qué es y qué no es
Un recorrido guiado que se abre en el navegador o el celular: muestra la pantalla real (captura), resalta
dónde tocar, explica en una frase y avanza con "Siguiente" o solo. **No es** una copia funcional del sistema
ni se conecta a la base. Ventajas sobre un video: cada quien va a su ritmo, pesa poco y se actualiza cambiando
una captura. Si el dueño quiere un archivo de video para WhatsApp, se graba el mismo recorrido con Playwright
(`recordVideo`) y se entrega aparte.

### 6.2 Primera versión: cinco flujos
1. **Entrar** (dirección, usuario, PIN, cambiar PIN temporal).
2. **Agendar una cita** (recepción): cliente, servicio, barbero, hora; reprogramar; mandar confirmación por WhatsApp.
3. **Cobrar** (recepción): desde la cita, productos con vendedor, método de pago, propina, ticket.
4. **Abrir y cerrar caja** (recepción): fondo, movimientos, cierre guiado, apartado.
5. **Mi semana** (barbero y recepción): qué llevo ganado y cómo se calcula.

Segunda versión (si se pide): pago semanal y faltas (gerencia), gastos con comprobante, inventario, reservas
en línea vistas por el cliente.

### 6.3 Diseño técnico
- Un solo archivo `docs/tutorial/index.html` con CSS y JS propios, sin dependencias externas ni rastreo;
  las capturas en `docs/tutorial/img/`. Debe funcionar abierto desde el disco y publicado.
- Datos del recorrido en un arreglo JS: `{ flujo, paso, imagen, zona: {x, y, ancho, alto}, titulo, texto }`
  con coordenadas en porcentaje para que escalen.
- Animación solo con `transform` y `opacity`; respeta `prefers-reduced-motion`; controles con teclado
  (flechas, espacio) y táctiles (deslizar); barra de avance; menú de flujos; modo "reproducir solo".
- Dos juegos de capturas: celular para barberos y recepción, computadora para gerencia.
- Accesible: texto alternativo en cada captura, contraste AA, foco visible.
- Publicación: enlace compartible de la sesión; opcional una ruta `/ayuda` en la aplicación (eso sí sería un
  cambio al sistema: pedir visto bueno y seguir las reglas de la Fase 4).

## 7. Orden de trabajo, tiempos y verificación

| Paso | Qué | Tiempo estimado | Quién |
|---|---|---|---|
| 1 | Preparar práctica con datos de ensayo y banco de capturas (E0) | 45 a 60 min | Un agente de navegador |
| 2 | Índice del manual → se le manda al dueño para ajuste | 15 min | Agente principal |
| 3 | Manual completo en PDF (E1) | 1.5 a 2 h | Un agente |
| 4 | Tres presentaciones (E2, E3, E4) | 2 h en serie, 45 min en paralelo | Hasta tres agentes |
| 5 | Tutorial (E5), cinco flujos | 1.5 a 2 h | Un agente, en paralelo con el paso 4 |
| 6 | Revisión completa y correcciones | 45 min | Agente principal |
| 7 | Limpieza de accesos y archivo nuevo de PIN de práctica | 10 min | Agente principal |

Total: 4 a 5 horas en serie; unas 3 horas con los pasos 4 y 5 en paralelo. Son estimaciones.

**Verificación antes de entregar cada pieza**
- Cada afirmación del tipo "el sistema hace X" se comprobó ese día en práctica o en el código; lo no comprobado
  se dice.
- Ninguna cifra sin fuente; las de ensayo, rotuladas.
- Ningún PIN, llave, teléfono real o dato de cliente real visible.
- PDF revisado página por página; presentaciones lámina por lámina; tutorial recorrido completo en celular y
  computadora, con teclado y con movimiento reducido.
- Las cuatro etiquetas coinciden entre manual, presentaciones y tutorial.
- Al final: llave temporal borrada, `must_change_pin` restaurado, práctica en su estado final (§3.3).

## 8. Cómo pedir cambios y dejar observaciones desde otra conversación

Una conversación nueva **no recuerda** las anteriores. La memoria del proyecto son estos documentos. Para
consultar o pedir cambios en otro chat:

1. Abrir una sesión nueva de Claude Code sobre el repositorio `aloszm/sonblade-management-system`.
2. Pegar como primer mensaje algo así:

   > Lee `AGENTS.md`, `docs/implementation/FASE_4.md` y `docs/implementation/FASE_5.md` antes de responder.
   > Soy el dueño. Explícame desde cero, con honestidad y sin tecnicismos. Trabaja en la rama de trabajo, prueba
   > en práctica, y no publiques a producción sin que yo lo pida de forma expresa.
   > Mi observación o cambio es: …

3. Para cada observación, decir: **en qué pantalla**, **con qué cuenta o puesto**, **qué esperabas** y **qué
   pasó**; si se puede, una captura. En práctica o en producción (decir cuál).
4. Al terminar, pedirle a esa sesión que **anote lo hecho** en `FASE_4.md` (o en este archivo si es de la
   Fase 5), para que la siguiente conversación lo sepa.

Reglas que esa sesión debe respetar (están en `AGENTS.md` y `FASE_4.md` §0.2): nunca escribir PIN ni llaves;
nunca probar contra producción; cambios de base primero en desarrollo; publicar solo con visto bueno expreso;
base antes que código.

## 9. Observaciones y defectos encontrados durante la fase

(Vacío. Anotar aquí con fecha: qué se vio, dónde, y si se corrigió o quedó pendiente.)

## 10. Preguntas abiertas para el dueño

1. ¿Regreso a Sonia y a Lucía a su puesto real en práctica para las capturas, o capturo con una cuenta de prueba?
2. Tres o cuatro frases tuyas sobre por qué empezaste el proyecto (para tu presentación).
3. Fechas aproximadas de las fases 1 a 3 en octubre.
4. ¿Quieres además un archivo de video del tutorial para WhatsApp?
5. ¿El tutorial vive solo como enlace, o también dentro del sistema en una sección "Ayuda"?
6. ¿Nombre y logotipo que debe llevar el material: "BarberOS" o solo "Gallo 4:20"?
