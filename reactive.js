/***************************************************************************
 * 1. 全局变量与基础常量
 **************************************************************************/

// 全局保存“当前正在执行的副作用函数”
let activeEffect
// 用于嵌套调用 effect 时的栈
const effectStack = []

// 一个特殊的 key，用来标识“遍历”操作（如 for...in）
const ITERATE_KEY = Symbol("iterate")

// 用来存储 “原始对象 => 代理对象” 的映射
const reactiveMap = new Map()

// 存储副作用函数的“桶”：
// WeakMap 的 key 是“原始对象”，value 是一个 Map，
// 该 Map 的 key 是“属性”，value 是“与该属性相关的副作用函数集合”。
const bucket = new WeakMap()

// 当数组调用像 push、pop 之类方法时，会在此处禁用依赖收集
let shouldTrack = true

/***************************************************************************
 * 2. effect 函数 —— 注册副作用
 **************************************************************************/
/**
 * 注册副作用函数
 * @param {Function} fn 要执行的副作用函数
 * @param {Object} options 配置对象，如 { lazy: true, scheduler: fn, ... }
 * @returns {Function} effectFn，可手动调用执行
 */
function effect(fn, options = {}) {
  const effectFn = () => {
    cleanup(effectFn) // ① 执行清除
    activeEffect = effectFn
    effectStack.push(effectFn) // ② 入栈

    const res = fn() // ③ 执行用户的副作用函数

    effectStack.pop() // ④ 出栈
    activeEffect = effectStack[effectStack.length - 1]
    return res
  }

  effectFn.options = options
  // effectFn.deps 用来存储所有与该副作用函数相关联的“依赖集合（Set）”
  effectFn.deps = []

  // 如果不是懒执行，立即执行一次
  if (!options.lazy) {
    effectFn()
  }

  return effectFn
}

/***************************************************************************
 * 3. computed 计算属性
 **************************************************************************/
/**
 * 定义一个 computed 计算属性
 * @param {Function} getter 用于计算的函数
 * @returns {Object} { value: ... }
 */
function computed(getter) {
  let value // 缓存上一次计算结果
  let dirty = true // 标志是否需要重新计算

  // 创建一个 lazy 的 effect，用于执行 getter
  const effectFn = effect(getter, {
    lazy: true,
    // 当依赖变化时，将 dirty 置为 true，并触发依赖更新
    scheduler() {
      dirty = true
      // 手动触发响应（让外部读取 value 时可以重新计算）
      trigger(obj, "value")
    },
  })

  const obj = {
    get value() {
      if (dirty) {
        value = effectFn() // 重新计算
        dirty = false // 重置 dirty
      }
      // 访问时手动收集依赖
      track(obj, "value")
      return value
    },
  }

  return obj
}

/***************************************************************************
 * 4. watch 侦听
 **************************************************************************/
/**
 * watch 函数用于侦听数据变化
 * @param {Function | Object} source 可以是一个函数，也可以是一个对象
 * @param {Function} cb 回调函数 (newValue, oldValue, onInvalidate) => {}
 * @param {Object} options 选项，如 { immediate: true, flush: 'post' }
 */
function watch(source, cb, options = {}) {
  let getter
  if (typeof source === "function") {
    // 如果 source 是函数，直接拿来做 getter
    getter = source
  } else {
    // 否则把对象递归读取 (traverse)
    getter = () => traverse(source)
  }

  let oldValue, newValue

  // 用来存储用户注册的“过期回调”
  let cleanup
  function onInvalidate(fn) {
    cleanup = fn
  }

  // 真正执行回调的函数
  const job = () => {
    newValue = effectFn()
    // 调用用户的过期回调
    if (cleanup) {
      cleanup()
    }
    // 调用用户给的 watch 回调
    cb(newValue, oldValue, onInvalidate)
    oldValue = newValue
  }

  // 创建一个 lazy 的 effect
  const effectFn = effect(() => getter(), {
    lazy: true,
    scheduler: () => {
      if (options.flush === "post") {
        // post 模式下，放入微任务
        Promise.resolve().then(job)
      } else {
        // 否则直接执行
        job()
      }
    },
  })

  if (options.immediate) {
    // 若 immediate，先执行一次
    job()
  } else {
    // 否则拿到旧值
    oldValue = effectFn()
  }
}

/**
 * 用来递归读取一个对象（或任意数据）的所有嵌套属性，从而收集依赖
 * @param {*} value 要读取的值
 * @param {Set} seen 用于防止循环引用
 * @returns {*} value 本身
 */
function traverse(value, seen = new Set()) {
  if (typeof value !== "object" || value === null || seen.has(value)) {
    return
  }
  seen.add(value)
  for (const key in value) {
    traverse(value[key], seen)
  }
  return value
}

/***************************************************************************
 * 5. cleanup —— 清除副作用函数
 **************************************************************************/
/**
 * 将副作用函数从所有依赖集合中移除，避免遗留冗余
 * @param {Function} effectFn 副作用函数
 */
function cleanup(effectFn) {
  for (let i = 0; i < effectFn.deps.length; i++) {
    // effectFn.deps[i] 是一个 “依赖集合 (Set)”
    const deps = effectFn.deps[i]
    deps.delete(effectFn)
  }
  effectFn.deps.length = 0
}

/***************************************************************************
 * 6. track & trigger —— 依赖收集与触发
 **************************************************************************/
/**
 * 在“读取”时追踪依赖
 * @param {Object} target 原始对象
 * @param {string | symbol} key 属性名
 */
function track(target, key) {
  if (!activeEffect || !shouldTrack) return

  let depsMap = bucket.get(target)
  if (!depsMap) {
    depsMap = new Map()
    bucket.set(target, depsMap)
  }

  let deps = depsMap.get(key)
  if (!deps) {
    deps = new Set()
    depsMap.set(key, deps)
  }

  deps.add(activeEffect)
  // 让副作用函数记住当前依赖集合
  activeEffect.deps.push(deps)
}

/**
 * 在“设置”时触发更新
 * @param {Object} target 原始对象
 * @param {string|symbol} key 属性名
 * @param {'ADD'|'SET'|'DELETE'} type 操作类型
 * @param {*} newVal 新值（仅用于数组 length 情况下）
 */
function trigger(target, key, type, newVal) {
  const depsMap = bucket.get(target)
  if (!depsMap) return

  // 与当前 key 相关的副作用函数
  const effects = depsMap.get(key)

  // 与遍历操作相关的副作用函数
  const iterateEffects = depsMap.get(ITERATE_KEY)

  const effectsToRun = new Set()
  // 将当前 key 下的 effect 都放入 effectsToRun
  effects &&
    effects.forEach((effectFn) => {
      if (effectFn !== activeEffect) {
        effectsToRun.add(effectFn)
      }
    })

  // 如果是数组，并且 key === 'length'，需要处理索引 >= newVal 的副作用
  if (Array.isArray(target) && key === "length") {
    depsMap.forEach((dep, depKey) => {
      if (depKey >= newVal) {
        dep.forEach((effectFn) => {
          if (effectFn !== activeEffect) {
            effectsToRun.add(effectFn)
          }
        })
      }
    })
  }

  // 如果是数组，且是“新增”操作，也要触发与 length 相关的副作用
  if (type === "ADD" && Array.isArray(target)) {
    const lengthEffects = depsMap.get("length")
    lengthEffects &&
      lengthEffects.forEach((effectFn) => {
        effectsToRun.add(effectFn)
      })
  }

  // 如果是“ADD”或“DELETE”，还要触发与迭代相关的副作用
  if (type === "ADD" || type === "DELETE") {
    iterateEffects &&
      iterateEffects.forEach((effectFn) => {
        if (effectFn !== activeEffect) {
          effectsToRun.add(effectFn)
        }
      })
  }

  // 执行副作用
  effectsToRun.forEach((effectFn) => {
    if (effectFn.options.scheduler) {
      // 如果有调度器，则交给调度器
      effectFn.options.scheduler(effectFn)
    } else {
      effectFn()
    }
  })
}

/***************************************************************************
 * 7. 数组特殊处理 —— arrayInstrumentations
 **************************************************************************/
const arrayInstrumentations = {}
;["push", "pop", "shift", "unshift", "splice", "sort", "reverse"].forEach((method) => {
  const originMethod = Array.prototype[method]
  arrayInstrumentations[method] = function (...args) {
    shouldTrack = false
    let res = originMethod.apply(this, args)
    shouldTrack = true
    return res
  }
})
;["includes", "indexOf", "lastIndexOf"].forEach((method) => {
  const originMethod = Array.prototype[method]
  arrayInstrumentations[method] = function (...args) {
    let res = originMethod.apply(this, args)
    if (res === false || res === -1) {
      // 没找到再到原始数据上去找
      res = originMethod.apply(this.raw, args)
    }
    return res
  }
})

/***************************************************************************
 * 8. 核心：createReactive —— 创建代理
 **************************************************************************/
function createReactive(obj, isShallow = false, isReadonly = false) {
  return new Proxy(obj, {
    get(target, key, receiver) {
      // 可通过 raw 属性拿到原始数据
      if (key === "raw") return target

      // 数组特殊方法的劫持
      if (Array.isArray(target) && arrayInstrumentations.hasOwnProperty(key)) {
        return Reflect.get(arrayInstrumentations, key, receiver)
      }

      // 非只读时，收集依赖
      if (!isReadonly && typeof key !== "symbol") {
        track(target, key)
      }

      const res = Reflect.get(target, key, receiver)

      // 如果是浅响应，则直接返回
      if (isShallow) {
        return res
      }

      // 如果读取值还是对象，再次包装（深层次代理）
      if (typeof res === "object" && res !== null) {
        return isReadonly ? readonly(res) : reactive(res)
      }

      return res
    },

    set(target, key, newVal, receiver) {
      if (isReadonly) {
        console.warn(`Set operation on key "${String(key)}" failed: target is readonly.`)
        return true
      }

      const oldVal = target[key]
      // 判断操作类型：ADD or SET
      const type = Array.isArray(target)
        ? Number(key) < target.length
          ? "SET"
          : "ADD"
        : Object.prototype.hasOwnProperty.call(target, key)
        ? "SET"
        : "ADD"

      const res = Reflect.set(target, key, newVal, receiver)

      // 只有当 target === receiver.raw，才说明是同一个对象
      if (target === receiver.raw) {
        // 值确实变化了再触发
        if (newVal !== oldVal && (newVal === newVal || oldVal === oldVal)) {
          trigger(target, key, type, newVal)
        }
      }
      return res
    },

    has(target, key) {
      track(target, key)
      return Reflect.has(target, key)
    },

    ownKeys(target) {
      // 如果是数组，则用 length 代表依赖键，否则用 ITERATE_KEY
      track(target, Array.isArray(target) ? "length" : ITERATE_KEY)
      return Reflect.ownKeys(target)
    },

    deleteProperty(target, key) {
      if (isReadonly) {
        console.warn(`Delete operation on key "${String(key)}" failed: target is readonly.`)
        return true
      }

      const hadKey = Object.prototype.hasOwnProperty.call(target, key)
      const res = Reflect.deleteProperty(target, key)
      if (res && hadKey) {
        trigger(target, key, "DELETE")
      }
      return res
    },
  })
}

/***************************************************************************
 * 9. 外部导出的“reactive”系列 API
 **************************************************************************/
function reactive(obj) {
  const existingProxy = reactiveMap.get(obj)
  if (existingProxy) return existingProxy

  const proxy = createReactive(obj)
  reactiveMap.set(obj, proxy)
  return proxy
}

function shallowReactive(obj) {
  return createReactive(obj, true, false)
}

function readonly(obj) {
  return createReactive(obj, false, true)
}

function shallowReadonly(obj) {
  return createReactive(obj, true, true)
}

/***************************************************************************
 * 10. ref / toRef / toRefs / proxyRefs
 **************************************************************************/
/**
 * ref: 将原始值包装成对象后再做 reactive
 */
function ref(val) {
  const wrapper = { value: val }
  Object.defineProperty(wrapper, "__v_isRef", {
    value: true,
    enumerable: false,
  })
  return reactive(wrapper)
}

/**
 * toRef: 将某个对象的指定属性“引用化”，产生一个带 .value get/set 的对象
 */
function toRef(obj, key) {
  const wrapper = {
    get value() {
      return obj[key]
    },
    set value(newVal) {
      obj[key] = newVal
    },
  }
  Object.defineProperty(wrapper, "__v_isRef", {
    value: true,
    enumerable: false,
  })
  return wrapper
}

/**
 * toRefs: 把对象所有属性都做 toRef，返回一个同名键的新对象
 */
function toRefs(obj) {
  const ret = {}
  for (const key in obj) {
    ret[key] = toRef(obj, key)
  }
  return ret
}

/**
 * proxyRefs: 实现“自动脱 ref”的代理
 */
function proxyRefs(target) {
  return new Proxy(target, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver)
      // 若是 ref，则返回 ref.value，否则返回原值
      return value && value.__v_isRef ? value.value : value
    },
    set(target, key, newValue, receiver) {
      const value = target[key]
      // 若原本是 ref，则只改 value
      if (value && value.__v_isRef) {
        value.value = newValue
        return true
      }
      return Reflect.set(target, key, newValue, receiver)
    },
  })
}

/***************************************************************************
 * 11. 示例：测试一下
 **************************************************************************/

const obj = reactive({ foo: 1, bar: 2 })
const newObj = proxyRefs({ ...toRefs(obj) })

console.log(newObj.foo) // => 1
newObj.foo = 100
console.log(obj.foo) // => 100

// 01 function patchChildren(n1, n2, container) {
//   02   if (typeof n2.children === 'string') {
//   03     // 省略部分代码
//   04   } else if (Array.isArray(n2.children)) {
//   05     const oldChildren = n1.children
//   06     const newChildren = n2.children
//   07     // 旧的一组子节点的长度
//   08     const oldLen = oldChildren.length
//   09     // 新的一组子节点的长度
//   10     const newLen = newChildren.length
//   11     // 两组子节点的公共长度，即两者中较短的那一组子节点的长度
//   12     const commonLength = Math.min(oldLen, newLen)
//   13     // 遍历 commonLength 次
//   14     for (let i = 0; i < commonLength; i++) {
//   15       patch(oldChildren[i], newChildren[i], container)
//   16     }
//   17     // 如果 newLen > oldLen，说明有新子节点需要挂载
//   18     if (newLen > oldLen) {
//   19       for (let i = commonLength; i < newLen; i++) {
//   20         patch(null, newChildren[i], container)
//   21       }
//   22     } else if (oldLen > newLen) {
//   23       // 如果 oldLen > newLen，说明有旧子节点需要卸载
//   24       for (let i = commonLength; i < oldLen; i++) {
//   25         unmount(oldChildren[i])
//   26       }
//   27     }
//   28   } else {
//   29     // 省略部分代码
//   30   }
//   31 }
