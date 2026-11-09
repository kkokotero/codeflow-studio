import type { CodeFile } from '@/lib/codeflow-types'

export const starterFiles: CodeFile[] = [
  {
    id: 'javascript-main',
    name: 'src/main.js',
    language: 'javascript',
    code: `function sumTo(limit) {
  let total = 0

  for (let index = 1; index <= limit; index += 1) {
    total += index
    console.log(\`step \${index}: \${total}\`)
  }

  return total
}

const result = sumTo(5)
console.log("result:", result)`,
  },
  {
    id: 'python-demo',
    name: 'examples/fibonacci.py',
    language: 'python',
    code: `def fibonacci(count):
    sequence = [0, 1]

    for index in range(2, count):
        sequence.append(sequence[-1] + sequence[-2])
        print(f"F({index}) = {sequence[-1]}")

    return sequence[:count]

result = fibonacci(8)
print("sequence:", result)`,
  },
  {
    id: 'javascript-helper',
    name: 'src/helpers.js',
    language: 'javascript',
    code: `function clamp(value, min, max) {
  if (value < min) return min
  if (value > max) return max
  return value
}`,
  },
]
