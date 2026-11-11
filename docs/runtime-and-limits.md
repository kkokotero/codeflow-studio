# CodeFlow: ejecución local y límites

## Dónde corre el código

El editor nunca evalúa el código en la página. Cada ejecución crea un **Web Worker** dentro del navegador y corre ahí el programa del archivo:

- **JavaScript y TypeScript** se ejecutan tal cual en el worker. TypeScript se traduce antes quitando sus anotaciones con el mismo analizador de Babel que usa el diagrama.
- **Python** usa Pyodide, que es CPython compilado a WebAssembly. El motor se carga la primera vez desde la ruta `/runtimes/pyodide` y queda en la caché del navegador.
- **Lua** usa Wasmoon, que trae Lua 5.4 compilado a WebAssembly.

Los archivos que forman parte de los motores se sirven desde `node_modules` por la ruta `/runtimes/[...path]`, que solo entrega bytes: no ejecuta nada y no recibe el código del usuario.

El resto de lenguajes (Go, C, C++, Java, C#, Rust) se analizan y se dibujan, pero no tienen un motor que quepa en el navegador: su consola avisa de que no se pueden ejecutar aquí.

## Qué se puede hacer

La consola muestra stdout y stderr **en vivo** y funciona como una terminal: lo que se escribe ahí va a la entrada estándar del programa, así que se pueden negociar los datos que pida.

```js
const nombre = await read('Nombre: ')
console.log(`Hola, ${nombre}`)
```

```python
nombre = input("Nombre: ")
print(f"Hola, {nombre}")
```

## Límites

Todo está acotado para que una pestaña no se quede bloqueada:

- fuente hasta 50 KB;
- 8 segundos de ejecución (20 en los motores que arrancan una máquina virtual);
- 16 KB de salida.

No hay peticiones al servidor ni cupo compartido: cada ejecución es local y se puede repetir tantas veces como haga falta.

## Lo que no se hace

No se instrumenta el código para capturar variables, pila de llamadas ni trazas por línea. El análisis del diagrama es estático: puede rechazar sintaxis no compatible en lugar de dibujar un flujo incompleto.

## Añadir un lenguaje

Un runtime es un archivo en `lib/runtimes/` que cumple el contrato de `lib/runtimes/types.ts`: recibe el código, avisa de la salida, acepta datos por la entrada estándar y termina avisando del resultado. Al registrarlo en `lib/runtimes/index.ts`, el lenguaje aparece en el selector de ejecución de la consola.
