/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // El aislamiento entre origenes habilita la memoria compartida: es lo que
  // permite que el programa espere datos escribidos por la persona usuaria.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
]

const nextConfig = {
  images: {
    unoptimized: true,
  },
  // Los motores se leen de node_modules con una ruta calculada en tiempo de
  // ejecución, así que el rastreo de archivos no los ve por sí solo: sin esta
  // lista el despliegue se sube sin los runtimes y ningún lenguaje compila.
  outputFileTracingIncludes: {
    '/runtimes/*': [
      './node_modules/pyodide/pyodide.mjs',
      './node_modules/pyodide/pyodide.asm.wasm',
      './node_modules/pyodide/python_stdlib.zip',
      './node_modules/wasmoon/dist/index.js',
      './node_modules/wasmoon/dist/glue.wasm',
      './node_modules/yaegi-wasm/src/index.js',
      './node_modules/yaegi-wasm/src/wasm_exec.js',
      './node_modules/yaegi-wasm/src/yaegi-browser.wasm',
      './node_modules/@live-codes/clang-wasm/dist/clang-wasm.global.js',
      './node_modules/@live-codes/clang-wasm/assets/bin/*',
      './node_modules/@live-codes/java-wasm/dist/**',
      './node_modules/@live-codes/blazor-wasm/blazor-wasm.js',
      './node_modules/@live-codes/blazor-wasm/refs.zip',
      './node_modules/@live-codes/blazor-wasm/_framework/**',
      './node_modules/@kreijstal/rubrc/*',
    ],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
