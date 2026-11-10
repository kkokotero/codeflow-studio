# CodeFlow: ejecución aislada y límites

## Ejecución de código

El editor nunca evalúa el código ni lo ejecuta dentro del navegador o del proceso Next.js. `POST /api/execute` valida el origen, limita el tamaño del cuerpo, exige el límite distribuido de Upstash y crea una microVM nueva mediante `@vercel/sandbox` para cada solicitud.

La VM usa la imagen universal de Vercel Sandbox, que contiene Node.js 24 y Python 3.14. Solo se escribe el archivo activo en `/vercel/sandbox`; el comando es fijo (`node` o `python3`) y no se pasan variables de entorno de la app, claves ni archivos del proyecto. `networkPolicy: 'deny-all'` bloquea conexiones de red desde el proceso. La VM es no persistente y se elimina en un bloque `finally`.

Límites por ejecución: fuente de 50.000 bytes, una vCPU (2 GB asignados por Sandbox), ocho segundos por comando y 16 KB de stdout+stderr; Node también limita el heap de V8 a 256 MB. El endpoint aplica cinco solicitudes por minuto por IP mediante una ventana deslizante de Upstash, guarda un hash de la IP en Redis y falla cerrado si no puede validar el límite. La API exige origen same-site y nunca devuelve errores internos del proveedor.

La interfaz muestra stdout y stderr y conserva hasta ocho resultados solo en memoria de la pestaña. No se instrumenta el código para capturar variables, pila de llamadas ni trazas por línea. La microVM aporta una frontera de aislamiento para código no confiable; esto no debe interpretarse como una garantía absoluta frente a errores o vulnerabilidades del proveedor.

## Diagramas

- JavaScript se analiza con el AST de Babel y Python con la gramática de `@lezer/python`; el análisis estático nunca ejecuta el código.
- Dagre dispone los nodos de arriba hacia abajo; las ramas salen por puertos laterales y los retornos de ciclos usan carriles externos.
- Los diagramas muestran entradas y salidas, procesos, decisiones, ciclos, funciones, retornos y conectores de convergencia.
- Las expresiones y literales se resumen dentro del proceso que los usa; no se expanden a nodos independientes.
- Las ramas de `switch` y `match` conservan sus etiquetas. Los caminos `break`, `continue` y `return` se conectan a sus destinos semánticos.
- La sintaxis inválida o una construcción que no se pueda representar fielmente produce un aviso sin un gráfico parcial engañoso.

## Límites

- El análisis se limita a 50.000 caracteres, 180 nodos y 24 niveles de anidación. Si se supera un límite, no se produce un diagrama parcial.
- `try/finally` y el control etiquetado no se representan todavía; CodeFlow informa esta limitación en vez de inventar rutas.
- Las llamadas dinámicas y las expresiones de colección se resumen como procesos. El diagrama no resuelve tipos, imports ni destinos dinámicos de llamadas.
- Las modificaciones, ejecuciones e historial permanecen en la sesión del navegador; no se persisten en una base de datos.
