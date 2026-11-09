# CodeFlow Studio: runtimes and limits

## Supported execution adapters

CodeFlow Studio currently runs JavaScript and Python. The adapter registry is `lib/runtime-adapters.ts`; adding a language requires an adapter, an isolated worker, a source-to-source instrumentation step, and tests for actual variable snapshots and failures. Languages shown as coming soon in the UI are not executable.

- **JavaScript:** Babel parses the source and inserts trace hooks after executable statements. A disposable Web Worker evaluates the instrumented program. The worker has no DOM access; common network and script-loading entry points are blocked. The worker is terminated after the run or its 10-second execution deadline.
- **Python:** Pyodide runs Python/WebAssembly in a disposable Web Worker. Python's AST transformer captures line and local-variable snapshots. Imports are limited to a small standard-library allowlist, and dynamic `eval`, `exec`, and `compile` calls from user code are rejected. Pyodide's WebAssembly files are loaded from jsDelivr on first use.

Snapshots are captured during actual execution and replayed for inspection. Playback controls navigate recorded states; they do not rewind or re-execute the program. Breakpoints pause that replay after the captured run rather than suspending the interpreter mid-run.

## Limits and trust

Source input is limited to 50,000 characters, snapshots to 2,000 statements, nested values to three levels and 50 items per collection, and call-stack display to 64 frames. Execution has a 10-second watchdog. Browsers do not provide a portable per-Worker memory quota, so this is not a hardened service for running hostile code; use only code you trust. The app does not upload source or run history. Files and snapshots are held in the current tab and can be exported manually.

The Python runtime is downloaded from jsDelivr when first used. Offline use requires that runtime to have been cached by the browser. Multi-file projects are editable/importable as a collection, but module resolution between files is not implemented yet; execution runs the active file only.

## Diagram behavior

JavaScript structure is parsed with Babel; Python structure is recognized from source lines. Selecting a diagram node navigates to its source line. Editing the selected source line in the inspector updates the editor and rebuilds the diagram. If the editor changes that line while the inspector has a draft, CodeFlow Studio reports a conflict and asks you to reload the current editor line before applying the draft. Dragged nodes and manually connected edges are diagram annotations; they do not rewrite program logic. Diagram structure and connections can be exported as JSON.

## Checks

The structural analyzer tests live in `lib/diagram.test.ts` and run with Vitest. Browser verification should cover the JavaScript worker and Python/WASM worker separately, including a successful run, runtime errors, and timeout/stop behavior.
