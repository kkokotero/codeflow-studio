import { describe, it } from 'vitest'
import { analyzeCode } from './diagram'
import type { Language } from './codeflow-types'

function show(name: string, language: Language, source: string) {
  const graph = analyzeCode(source, language)
  console.log(`\n=== ${name} (${language}) error=${graph.error ?? 'none'} ===`)
  for (const node of graph.nodes) {
    console.log(`  ${node.data.kind.padEnd(10)} | ${node.data.label} | l${node.data.line ?? '?'}`)
  }
}

describe('scratch', () => {
  it('inspects edge cases', () => {
    show('go anon func + composite literals', 'go', `package main

import "fmt"

func main() {
  values := []int{1, 2, 3}
  point := Point{X: 1, Y: 2}
  go func() {
    fmt.Println("hola")
  }()
  for _, value := range values {
    fmt.Println(value)
  }
}`)

    show('go switch/select', 'go', `package main

func main() {
  switch value {
  case 1:
    println("uno")
  default:
    println("otro")
  }
  select {
  case msg := <-ch:
    println(msg)
  default:
    println("nada")
  }
}`)

    show('go else if', 'go', `func check(value int) string {
  if value > 0 {
    return "positivo"
  } else if value < 0 {
    return "negativo"
  } else {
    return "cero"
  }
}`)

    show('rust expr block + match', 'rust', `fn main() {
    let value = {
        let base = 2;
        base + 3
    };
    let doubled = value * 2;
    match doubled {
        0 => println!("cero"),
        n if n > 5 => {
            println!("grande {}", n);
        }
        _ => println!("otro"),
    }
}`)

    show('cpp initializer list', 'cpp', `#include <vector>
#include <iostream>

int main() {
  std::vector<int> values = {1, 2, 3};
  for (int value : values) {
    std::cout << value << '\\n';
  }
  return 0;
}`)

    show('java array init + try/catch', 'java', `class Main {
  public static void main(String[] args) {
    int[] values = {1, 2, 3};
    try {
      System.out.println(values[0]);
    } catch (Exception error) {
      System.out.println(error);
    }
  }
}`)

    show('csharp object initializer + lambda', 'csharp', `using System;
using System.Linq;

class Program {
  static void Main() {
    var point = new Point { X = 1, Y = 2 };
    var evens = new[] { 1, 2, 3, 4 }.Where(x => x % 2 == 0);
    foreach (var value in evens) {
      Console.WriteLine(value);
    }
  }
}`)

    show('c struct init', 'c', `#include <stdio.h>

struct Point {
  int x;
  int y;
};

int main(void) {
  struct Point point = {1, 2};
  printf("%d\\n", point.x);
  return 0;
}`)

    show('lua nested', 'lua', `local function classify(value)
  if value > 0 then
    return "positivo"
  elseif value < 0 then
    return "negativo"
  else
    return "cero"
  end
end

for index = 1, 3 do
  print(classify(index))
end`)
  })
})
