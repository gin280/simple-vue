/**
 * @param {number[]} arr - 要求 LIS 的数组 (里面是整数或可比较的值)
 * @returns {number[]} 返回一个数组，表示 LIS 的下标序列
 */
export function lis(arr) {
  const n = arr.length
  if (n === 0) return []

  // p[i] 用来记录在构造 LIS 时，arr[i] 的前驱下标
  const p = new Array(n)
  // result 数组存放的是“递增子序列”在 arr 中下标的集合
  // result.length 就是当前找到的 LIS 长度
  const result = []

  for (let i = 0; i < n; i++) {
    const x = arr[i]
    // 1. 如果 result 为空，或 arr[result最后一个] < x，直接 push
    if (result.length === 0 || arr[result[result.length - 1]] < x) {
      // 新元素的前驱是 result 最末下标
      p[i] = result.length > 0 ? result[result.length - 1] : -1
      result.push(i)
    } else {
      // 2. 否则，用二分查找在 result 中找“第一个 >= x” 的位置
      let left = 0
      let right = result.length - 1
      while (left < right) {
        const mid = (left + right) >> 1
        if (arr[result[mid]] < x) {
          left = mid + 1
        } else {
          right = mid
        }
      }
      // 替换 result[left]
      if (arr[result[left]] >= x) {
        if (left > 0) {
          p[i] = result[left - 1]
        } else {
          p[i] = -1
        }
        result[left] = i
      }
    }
  }

  // 3. 回溯构建最终的 LIS 下标序列
  let len = result.length
  let last = result[len - 1]
  const lisIndices = []
  while (last !== -1) {
    lisIndices.push(last)
    last = p[last]
  }
  // 此时是从后往前追溯，需要反转
  lisIndices.reverse()

  return lisIndices
}
