function flatten(arr) {
  const stack = [...arr]
  const res = []
  while (stack.length) {
    const next = stack.shift()
    if (Array.isArray(next)) {
      stack.push(...next)
    } else {
      res.push(next)
    }
  }
  return res
}

// demo
const arr = [1, [2, [3, 4], 5]]
console.log(flatten(arr)) // [1, 2, 3, 4, 5]
