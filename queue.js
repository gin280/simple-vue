// 任务缓存队列, 用一个 Set 数据结构来表示, 这样就可以自动对任务进行去重
const queue = new Set()

// 一个标志， 代表是否正在刷新任务队列
let isFlushing = false
// 创建一个立即 resolve 的 Promise 实例
const p = Promise.resolve()

// 调度器的主要函数, 用来将一个任务添加到缓存队列中, 并开始刷新队列
export function queueJob(job) {
  // 将 job 添加到队列中
  queue.add(job)
  // 如果还没有开始刷新队列 就开始刷新队列
  if (!isFlushing) {
    // 将该标志设置为 true, 以避免重复刷新
    isFlushing = true
    // 在微任务中刷新缓存队列
    console.log(queue, "queue")
    p.then(() => {
      try {
        // 执行任务队列中的人物
        queue.forEach((job) => job())
      } finally {
        // 重置状态
        isFlushing = false
        // 清空任务队列
        queue.clear()
      }
    })
  }
}
