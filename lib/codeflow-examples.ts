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
    id: 'typescript-demo',
    name: 'examples/fibonacci.ts',
    language: 'typescript',
    code: `function fibonacci(count: number): number[] {
  const sequence: number[] = [0, 1]

  for (let index = 2; index < count; index += 1) {
    sequence.push(sequence[index - 1] + sequence[index - 2])
    console.log(\`F(\${index}) = \${sequence[index]}\`)
  }

  return sequence.slice(0, count)
}

const result = fibonacci(8)
console.log('sequence:', result)`,
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
    id: 'lua-demo',
    name: 'examples/sum.lua',
    language: 'lua',
    code: `local function sum_to(limit)
  local total = 0

  for index = 1, limit do
    total = total + index
    print("step", index, total)
  end

  return total
end

print("result:", sum_to(5))`,
  },
  {
    id: 'java-demo',
    name: 'examples/Main.java',
    language: 'java',
    code: `public class Main {
  static int sumTo(int limit) {
    int total = 0;

    for (int index = 1; index <= limit; index += 1) {
      total += index;
      System.out.println("step " + index + ": " + total);
    }

    return total;
  }

  public static void main(String[] args) {
    int result = sumTo(5);
    System.out.println("result: " + result);
  }
}`,
  },
  {
    id: 'c-demo',
    name: 'examples/main.c',
    language: 'c',
    code: `#include <stdio.h>

int main(void) {
  int total = 0;

  for (int index = 1; index <= 5; index += 1) {
    total += index;
    printf("step %d: %d\\n", index, total);
  }

  printf("result: %d\\n", total);
  return 0;
}`,
  },
  {
    id: 'cpp-demo',
    name: 'examples/main.cpp',
    language: 'cpp',
    code: `#include <iostream>

int main() {
  int total = 0;

  for (int index = 1; index <= 5; index += 1) {
    total += index;
    std::cout << "step " << index << ": " << total << '\\n';
  }

  std::cout << "result: " << total << '\\n';
  return 0;
}`,
  },
  {
    id: 'csharp-demo',
    name: 'examples/Program.cs',
    language: 'csharp',
    code: `using System;

class Program {
  static int SumTo(int limit) {
    int total = 0;

    for (int index = 1; index <= limit; index += 1) {
      total += index;
      Console.WriteLine("step " + index + ": " + total);
    }

    return total;
  }

  static void Main() {
    int result = SumTo(5);
    Console.WriteLine("result: " + result);
  }
}`,
  },
  {
    id: 'go-demo',
    name: 'examples/main.go',
    language: 'go',
    code: `package main

import "fmt"

func sumTo(limit int) int {
  total := 0

  for index := 1; index <= limit; index++ {
    total += index
    fmt.Printf("step %d: %d\\n", index, total)
  }

  return total
}

func main() {
  result := sumTo(5)
  fmt.Println("result:", result)
}`,
  },
  {
    id: 'rust-demo',
    name: 'examples/main.rs',
    language: 'rust',
    code: `fn sum_to(limit: i32) -> i32 {
  let mut total = 0;

  for index in 1..=limit {
    total += index;
    println!("step {}: {}", index, total);
  }

  total
}

fn main() {
  let result = sum_to(5);
  println!("result: {}", result);
}`,
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
