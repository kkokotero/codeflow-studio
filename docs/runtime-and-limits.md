# Análisis estático y límites de seguridad

## Ejecución de código

La ejecución arbitraria de JavaScript y Python está desactivada. El editor no evalúa el código, no crea workers de ejecución y no envía el texto a una API para ejecutarlo. El botón de ejecución permanece deshabilitado y el motivo se muestra en la interfaz.

El runtime local anterior no ofrecía aislamiento suficiente para tratar código pegado como confiable. La ejecución solo debería reactivarse tras incorporar un entorno aislado de verdad, con límites de CPU, memoria, tiempo y red, y pruebas específicas de aislamiento. Hasta entonces, CodeFlow conserva el editor, la importación/exportación y el diagrama estático; no muestra valores calculados, salida real, pila de llamadas ni snapshots.

## Diagramas

- JavaScript se analiza con el AST de Babel y Python con la gramática de `@lezer/python`; ninguno de los analizadores ejecuta el código fuente.
- Los diagramas muestran entradas y salidas, procesos, decisiones, ciclos, funciones, retornos y conectores de convergencia.
- Las expresiones y literales se resumen dentro del proceso que los usa; no se expanden a nodos independientes.
- Las ramas de `switch` y `match` conservan sus etiquetas. Los caminos `break`, `continue` y `return` se conectan a sus destinos semánticos.
- La sintaxis inválida o una construcción que no se pueda representar fielmente produce un aviso sin un gráfico parcial engañoso.

## Límites

- El análisis se limita a 50.000 caracteres, 180 nodos y 24 niveles de anidación. Si se supera un límite, no se produce un diagrama parcial.
- `try/finally` y el control etiquetado no se representan todavía; CodeFlow informa esta limitación en vez de inventar rutas.
- Las llamadas dinámicas y las expresiones de colección se resumen como procesos. El diagrama no resuelve tipos, imports ni destinos dinámicos de llamadas.
- Las modificaciones e importaciones permanecen en la sesión del navegador hasta que se exportan. El proyecto no tiene un backend de guardado ni endpoints de ejecución.
