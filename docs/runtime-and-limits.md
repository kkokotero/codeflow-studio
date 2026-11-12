# CodeFlow: ejecución local y límites

## Dónde corre el código

El editor nunca evalúa el código en la página. Cada ejecución crea un **Web Worker** dentro del navegador y corre ahí el programa del archivo:

| Lenguaje | Motor | Qué hace |
| --- | --- | --- |
| JavaScript y TypeScript | Web Worker nativo | El programa se ejecuta tal cual; TypeScript se traduce antes quitando sus anotaciones con el mismo analizador de Babel que usa el diagrama. |
| Python | Pyodide | CPython compilado a WebAssembly, con su biblioteca estándar. |
| Lua | Wasmoon | Lua 5.4 compilado a WebAssembly. |
| Go | Yaegi | Intérprete de Go compilado a WebAssembly: interpreta el fuente con la biblioteca estándar. |
| C y C++ | Clang 22 | El compilador de Clang compilado a WebAssembly: el fuente se compila a un módulo WASI (`wasm32-wasi`) y se ejecuta en el mismo worker. |
| Java | javac + TeaVM | `javac` y el compilador AOT de TeaVM dentro de un único módulo de WebAssembly: el fuente se compila a clases y se ejecuta en JavaScript. |
| C# | .NET (Blazor WASM) | El runtime de .NET y el compilador de Roslyn dentro de la página: el fuente se compila y se ejecuta sin servidor. |
| Rust | rustc + cargo (Rubrc) | El propio compilador de Rust compilado a WebAssembly: `cargo` compila el fuente para `wasm32-wasip1` y lo ejecuta en la misma pestaña. |

Los archivos que forman parte de los motores se sirven desde `node_modules` por la ruta `/runtimes/[...path]`, que solo entrega bytes: no ejecuta nada y no recibe el código del usuario.

Los motores se descargan la primera vez que se usan y quedan en la caché del navegador. Mientras se descargan, la consola muestra una barra con el nombre del archivo y los kilobytes que lleva; a partir de la segunda ejecución el motor arranca al instante.

Rust es el caso más pesado: su cadena de herramientas son 56 MB y la biblioteca estándar del compilador son 19 MB más. El motor se queda en memoria entre ejecuciones, así que solo se paga una vez.

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
- 8 segundos de ejecución (30 en los motores que arrancan una máquina virtual, 60 en los que compilan antes de ejecutar y 240 en Rust, que descarga su propia cadena de herramientas);
- 16 KB de salida.

No hay peticiones al servidor ni cupo compartido: cada ejecución es local y se puede repetir tantas veces como haga falta.

C# es la excepción: Blazor busca un punto de anclaje en la página y compila en el hilo principal, así que la interfaz se queda quieta los segundos que tarda Roslyn. El resto de motores trabaja en su worker y la interfaz no se bloquea.

## Lo que no se hace

No se instrumenta el código para capturar variables, pila de llamadas ni trazas por línea. El análisis del diagrama es estático: puede rechazar sintaxis no compatible en lugar de dibujar un flujo incompleto.

## Añadir un lenguaje

Un runtime es un archivo en `lib/runtimes/` que cumple el contrato de `lib/runtimes/types.ts`: recibe el código, avisa de la salida, acepta datos por la entrada estándar y termina avisando del resultado. Al registrarlo en `lib/runtimes/index.ts`, el lenguaje aparece en el selector de ejecución de la consola.

Los archivos que el motor descarga se declaran en `lib/runtimes/assets.ts`: esa lista es la que alimenta la barra de progreso de la consola.
