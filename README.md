# simple-vue

这是一个简化版的 Vue 响应式系统与编译器示例，借助现代 JavaScript/TypeScript 技术来演示前端框架核心原理。主要包含了 **响应式**、**模板编译**、**虚拟 DOM 渲染**、**Diff 算法** 等关键思想，帮助你理解 Vue 内部工作方式。

---

## 目录结构

- **index.html**  
  入口 HTML 文件，可在浏览器中直接打开，或借助本地服务器访问。

- **index.ts / tsconfig.json**  
  TypeScript 入口及其配置，若想编写/调试 TS 代码，可以通过这些文件进行编译。

- **compile.js / compileOptimization.js**  
  - `compile.js`: 基础模板编译实现，将模板字符串解析为 AST 并生成渲染函数  
  - `compileOptimization.js`: 带有编译策略优化的版本

- **reactive.js**  
  简易 **响应式系统**（类似 Vue 3 的 `reactivity`），实现依赖收集与触发更新。

- **renderer.js**  
  包含 **渲染** 和 **Diff** 逻辑，将虚拟节点更新为真实 DOM。

- **queue.js**  
  实现了一个调度队列，模拟 Vue 的异步更新机制（如 nextTick/队列调度）。

- **lis.js**  
  计算 **最长递增子序列 (LIS)** 的工具，用于 Diff 算法中 key-ed children 的最小移动计算。


  

