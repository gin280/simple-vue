/****************************************************************************
 * 1. 引入依赖与通用常量/工具
 ***************************************************************************/
const { effect, ref, reactive, shallowReactive, shallowRef, shallowReadonly } = VueReactivity
import { lis } from "./lis.js"
import { queueJob } from "./queue.js"

// 用于判断是否为 VOID 标签
const VOID_TAGS = "area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr"

// 应该忽略的属性，如 key、ref
const shouldIgnoreProp = ["key", "ref"]

// 判断属性名称是否安全
const isSSRSafeAttrName = (key) => !/[>/="'\u0009\u000a\u000c\u0020]/.test(key)

// 用来转义属性值的正则
const escapeRE = /["'&<>]/

// 常量：表示几种特殊的 vnode 类型
const Text = Symbol("Text")
const Comment = Symbol("Comment")
const Fragment = Symbol("Fragment")

/****************************************************************************
 * 2. 示例组件 MyComponent
 ***************************************************************************/
const MyComponent = {
  name: "App",
  setup() {
    // str 用 ref 包裹
    const str = ref("foo")
    return () => {
      return {
        key: "root",
        type: "div",
        children: [
          {
            key: "a",
            type: "span",
            children: str.value,
            props: {
              onClick: () => {
                str.value = "bar"
              },
            },
          },
          {
            key: "b",
            type: "span",
            children: "baz",
          },
        ],
      }
    }
  },
}

/** 组件 vnode，用来测试 */
const CompVNode = {
  type: MyComponent,
}

/****************************************************************************
 * 3. createRenderer —— 核心渲染器
 ***************************************************************************/
export function createRenderer(options) {
  // DOM 操作 API，从外部传入
  const { createElement, insert, setElementText, patchProps, createText, setText, createComment } =
    options

  // -------------------------------
  // patch 函数：入口
  // -------------------------------
  function patch(n1, n2, container, anchor) {
    // 若旧节点存在，但类型与新节点不同，直接卸载旧节点
    if (n1 && n1.type !== n2.type) {
      unmount(n1)
      n1 = null
    }

    const { type } = n2
    if (typeof type === "string") {
      // 普通标签元素
      if (!n1) {
        mountElement(n2, container, anchor)
      } else {
        patchElement(n1, n2)
      }
    } else if (type === Text) {
      // 文本节点
      if (!n1) {
        const el = (n2.el = createText(n2.children))
        insert(el, container)
      } else {
        const el = (n2.el = n1.el)
        if (n2.children !== n1.children) {
          setText(el, n2.children)
        }
      }
    } else if (type === Comment) {
      // 注释节点
      if (!n1) {
        const el = (n2.el = createComment(n2.children))
        insert(el, container)
      } else {
        const el = (n2.el = n1.el)
        if (n2.children !== n1.children) {
          setText(el, n2.children)
        }
      }
    } else if (type === Fragment) {
      // Fragment
      if (!n1) {
        n2.children.forEach((c) => patch(null, c, container))
      } else {
        patchChildren(n1, n2, container)
      }
    } else if (typeof type === "object") {
      // 组件
      if (!n1) {
        mountComponent(n2, container, anchor)
      } else {
        // patch 组件
        patchComponent(n1, n2, anchor)
      }
    }
  }

  // -------------------------------
  // mountElement：挂载普通元素
  // -------------------------------
  function mountElement(vnode, container, anchor) {
    const el = (vnode.el = createElement(vnode.type))

    // 若 children 是字符串，直接设置文本
    if (typeof vnode.children === "string") {
      setElementText(el, vnode.children)
    }
    // 若 children 是数组，递归 patch
    else if (Array.isArray(vnode.children)) {
      vnode.children.forEach((child) => {
        patch(null, child, el)
      })
    }

    // 处理 props
    if (vnode.props) {
      for (const key in vnode.props) {
        patchProps(el, key, null, vnode.props[key])
      }
    }

    // 插入
    insert(el, container, anchor)
  }

  // -------------------------------
  // patchElement：更新普通元素
  // -------------------------------
  function patchElement(n1, n2) {
    const el = (n2.el = n1.el)
    const oldProps = n1.props
    const newProps = n2.props

    // 1. 先更新 props
    for (const key in newProps) {
      if (newProps[key] !== oldProps[key]) {
        patchProps(el, key, oldProps[key], newProps[key])
      }
    }
    for (const key in oldProps) {
      if (!(key in newProps)) {
        patchProps(el, key, oldProps[key], null)
      }
    }

    // 2. 再更新 children
    patchChildren(n1, n2, el)
  }

  // -------------------------------
  // patchChildren：更新子节点
  // -------------------------------
  function patchChildren(n1, n2, container) {
    // 若新 children 是字符串
    if (typeof n2.children === "string") {
      if (Array.isArray(n1.children)) {
        n1.children.forEach((child) => unmount(child))
      }
      setElementText(container, n2.children)
    }
    // 若新 children 是数组
    else if (Array.isArray(n2.children)) {
      if (Array.isArray(n1.children)) {
        patchKeyedChildren(n1, n2, container)
      } else {
        setElementText(container, "")
        n2.children.forEach((child) => patch(null, child, container))
      }
    } else {
      // 新 children 不存在
      if (Array.isArray(n1.children)) {
        n1.children.forEach((child) => unmount(child))
      } else if (typeof n1.children === "string") {
        setElementText(container, "")
      }
    }
  }

  // -------------------------------
  // patchKeyedChildren：带 key 的 diff
  // -------------------------------
  function patchKeyedChildren(n1, n2, container) {
    const newChildren = n2.children
    const oldChildren = n1.children

    // 1. 前置节点
    let j = 0
    let oldVnode = oldChildren[j]
    let newVnode = newChildren[j]
    while (oldVnode && newVnode && oldVnode.key === newVnode.key) {
      patch(oldVnode, newVnode, container)
      j++
      oldVnode = oldChildren[j]
      newVnode = newChildren[j]
    }

    // 2. 后置节点
    let oldEnd = oldChildren.length - 1
    let newEnd = newChildren.length - 1
    oldVnode = oldChildren[oldEnd]
    newVnode = newChildren[newEnd]
    while (oldVnode && newVnode && oldVnode.key === newVnode.key) {
      patch(oldVnode, newVnode, container)
      oldEnd--
      newEnd--
      oldVnode = oldChildren[oldEnd]
      newVnode = newChildren[newEnd]
    }

    // 3. 处理新节点多出的部分
    if (j > oldEnd && j <= newEnd) {
      const anchorIndex = newEnd + 1
      const anchor = anchorIndex < newChildren.length ? newChildren[anchorIndex].el : null
      while (j <= newEnd) {
        patch(null, newChildren[j++], container, anchor)
      }
    }
    // 4. 处理旧节点多出的部分
    else if (j > newEnd && j <= oldEnd) {
      while (j <= oldEnd) {
        unmount(oldChildren[j++])
      }
    }
    // 5. 需要完整 diff
    else {
      const count = newEnd - j + 1
      const source = new Array(count).fill(-1)

      const oldStart = j
      const newStart = j

      let moved = false
      let pos = 0

      // 建立 key -> index 映射
      const keyIndex = {}
      for (let i = newStart; i <= newEnd; i++) {
        keyIndex[newChildren[i].key] = i
      }

      // 记录更新过的节点数量
      let patched = 0
      for (let i = oldStart; i <= oldEnd; i++) {
        oldVnode = oldChildren[i]
        if (patched < count) {
          const k = keyIndex[oldVnode.key]
          if (k !== undefined) {
            newVnode = newChildren[k]
            patch(oldVnode, newVnode, container)
            source[k - newStart] = i
            if (k < pos) {
              moved = true
            } else {
              pos = k
            }
            patched++
          } else {
            unmount(oldVnode)
          }
        } else {
          unmount(oldVnode)
        }
      }

      // 若存在移动
      if (moved) {
        const seq = lis(source)
        let s = seq.length - 1
        let i = count - 1
        for (; i >= 0; i--) {
          if (source[i] === -1) {
            // 需挂载新节点
            const pos = newStart + i
            const newVNode = newChildren[pos]
            const nextPos = pos + 1
            const anchor = nextPos < newChildren.length ? newChildren[nextPos].el : null
            patch(null, newVNode, container, anchor)
          } else if (i !== seq[s]) {
            // 需移动
            const pos = newStart + i
            const newVNode = newChildren[pos]
            const nextPos = pos + 1
            const anchor = nextPos < newChildren.length ? newChildren[nextPos].el : null
            insert(newVNode.el, container, anchor)
          } else {
            s--
          }
        }
      }
    }
  }

  // -------------------------------
  // mountComponent：挂载组件
  // -------------------------------
  let currentInstance = null
  function setCurrentInstance(instance) {
    currentInstance = instance
  }

  function mountComponent(vnode, container, anchor) {
    const componentOptions = vnode.type
    let {
      render,
      data,
      beforeCreated,
      created,
      beforeMount,
      mounted,
      beforeUpdate,
      updated,
      props: propsOption,
      setup,
    } = componentOptions

    setup = setup || (() => {})

    beforeCreated && beforeCreated()

    const state = data ? reactive(data()) : null
    const [props, attrs] = resolveProps(propsOption, vnode.props)
    const slots = vnode.children || {}

    const instance = {
      state,
      props: shallowReactive(props),
      isMounted: false,
      subTree: null,
      slots,
      mounted: [],
    }

    function emit(event, ...payload) {
      const eventName = `on${event[0].toUpperCase()}${event.slice(1)}`
      const handler = instance.props[eventName]
      if (handler) {
        handler(...payload)
      } else {
        console.warn(`event ${event} is not defined`)
      }
    }

    setCurrentInstance(instance)
    const setupContext = { attrs, emit, slots }
    const setupResult = setup(shallowReactive(instance.props), setupContext)
    setCurrentInstance(null)

    let setupState = null
    if (typeof setupResult === "function") {
      if (render) {
        console.error("setup 函数返回渲染函数, render 函数将被忽略")
      }
      render = setupResult
    } else {
      setupState = setupResult
    }

    vnode.component = instance

    const renderContext = new Proxy(instance, {
      get(t, k) {
        const { state, props, slots } = t
        if (k === "$slots") return slots
        if (state && k in state) return state[k]
        else if (props && k in props) return props[k]
        else if (setupState && k in setupState) return setupState[k]
        else console.error(`property ${k} is not defined`)
      },
      set(t, k, v) {
        const { state, props } = t
        if (state && k in state) {
          state[k] = v
        } else if (props && k in props) {
          console.warn(`props should not be mutated: ${k}`)
        } else if (setupState && k in setupState) {
          setupState[k] = v
        } else {
          console.error(`property ${k} is not defined`)
        }
        return true
      },
    })

    created && created.call(renderContext)

    // 组件副作用 effect
    effect(
      () => {
        const subTree = render.call(renderContext, state)

        if (!instance.isMounted) {
          beforeMount && beforeMount()
          if (vnode.el) {
            // hydrate
            hydrateNode(vnode.el, subTree)
          } else {
            patch(null, subTree, container, anchor)
          }
          instance.isMounted = true
          mounted && mounted.call(renderContext)
          instance.mounted && instance.mounted.forEach((hook) => hook.call(renderContext))
        } else {
          beforeUpdate && beforeUpdate.call(renderContext)
          patch(instance.subTree, subTree, container, anchor)
          updated && updated.call(renderContext)
        }
        instance.subTree = subTree
      },
      {
        scheduler: queueJob,
      }
    )
  }

  // -------------------------------
  // patchComponent：更新组件
  // -------------------------------
  function patchComponent(n1, n2, anchor) {
    const instance = (n2.component = n1.component)
    const { props } = instance
    if (hasPropsChanged(n1.props, n2.props)) {
      const [nextProps] = resolveProps(n2.type.props, n2.props)
      for (const key in nextProps) {
        props[key] = nextProps[key]
      }
      for (const key in props) {
        if (!(key in nextProps)) {
          delete props[key]
        }
      }
    }
  }

  function hasPropsChanged(prevProps, nextProps) {
    const nextKeys = Object.keys(nextProps)
    if (nextKeys.length !== Object.keys(prevProps).length) {
      return true
    }
    for (let i = 0; i < nextKeys.length; i++) {
      const key = nextKeys[i]
      if (prevProps[key] !== nextProps[key]) {
        return true
      }
    }
    return false
  }

  // -------------------------------
  // resolveProps
  // -------------------------------
  function resolveProps(options, propsData) {
    const props = {}
    const attrs = {}
    for (const key in propsData) {
      if (key in options || key.startsWith("on")) {
        props[key] = propsData[key]
      } else {
        attrs[key] = propsData[key]
      }
    }
    return [props, attrs]
  }

  // -------------------------------
  // hydrateNode：激活已经 SSR 出的 DOM
  // -------------------------------
  function hydrateNode(node, vnode) {
    vnode.el = node
    const { type } = vnode

    if (typeof type === "object") {
      mountComponent(vnode, container, null)
    } else if (typeof type === "string") {
      if (node.nodeType !== 1) {
        console.error("mismatch: DOM vs. VNode")
      } else {
        hydrateElement(node, vnode)
      }
    }
    return node.nextSibling
  }

  function hydrateElement(el, vnode) {
    // 事件绑定
    if (vnode.props) {
      for (const key in vnode.props) {
        if (/^on/.test(key)) {
          patchProps(el, key, null, vnode.props[key])
        }
      }
    }
    // 递归激活子节点
    if (Array.isArray(vnode.children)) {
      let nextNode = el.firstChild
      for (let i = 0; i < vnode.children.length; i++) {
        nextNode = hydrateNode(nextNode, vnode.children[i])
      }
    }
  }

  // -------------------------------
  // unmount：卸载
  // -------------------------------
  function unmount(vnode) {
    if (vnode.type === Fragment) {
      vnode.children.forEach((c) => unmount(c))
      return
    } else if (typeof vnode.type === "object") {
      // 卸载组件
      unmount(vnode.component.subTree)
      return
    }
    const parent = vnode.el.parentNode
    if (parent) {
      parent.removeChild(vnode.el)
    }
  }

  // -------------------------------
  // render / hydrate
  // -------------------------------
  function render(vnode, container) {
    if (vnode) {
      patch(container._vnode, vnode, container)
    } else {
      if (container._vnode) {
        unmount(container._vnode)
      }
    }
    container._vnode = vnode
  }

  function hydrate(vnode, container) {
    hydrateNode(container.firstChild, vnode)
  }

  // -------------------------------
  // SSR 渲染部分 (renderComponentVNode) 可选
  // -------------------------------
  function renderComponentVNode(vnode) {
    // 仅仅是 SSR 生成字符串用
    const isFunctional = typeof vnode.type === "function"
    let componentOptions = vnode.type
    if (isFunctional) {
      componentOptions = { render: vnode.type, props: vnode.type.props }
    }
    let { render, data, setup, beforeCreate, created, props: propsOption } = componentOptions

    const state = data ? data() : null
    const [props, attrs] = resolveProps(propsOption, vnode.props)
    const slots = vnode.children || {}

    const instance = {
      state,
      props,
      isMounted: false,
      subTree: null,
      slots,
      mounted: [],
      keepAliveCtx: null,
    }

    function emit(event, ...payload) {
      const eventName = `on${event[0].toUpperCase() + event.slice(1)}`
      const handler = instance.props[eventName]
      if (handler) {
        handler(...payload)
      } else {
        console.error("事件不存在")
      }
    }

    let setupState = null
    if (setup) {
      const setupContext = { attrs, emit, slots }
      const prevInstance = setCurrentInstance(instance)
      const setupResult = setup(shallowReadonly(instance.props), setupContext)
      setCurrentInstance(prevInstance)
      if (typeof setupResult === "function") {
        if (render) console.error("setup 返回渲染函数, render 选项将被忽略")
        render = setupResult
      } else {
        setupState = setupContext
      }
    }
    vnode.component = instance

    const renderContext = new Proxy(instance, {
      get(t, k) {
        const { state, props, slots } = t
        if (k === "$slots") return slots
        if (state && k in state) return state[k]
        else if (props && k in props) return props[k]
        else if (setupState && k in setupState) return setupState[k]
        else {
          console.error(`Property ${k} not found`)
        }
      },
      set(t, k, v) {
        const { state, props } = t
        if (state && k in state) {
          state[k] = v
        } else if (props && k in props) {
          props[k] = v
        } else if (setupState && k in setupState) {
          setupState[k] = v
        } else {
          console.error(`Property ${k} not found`)
        }
        return true
      },
    })

    created && created.call(renderContext)
    const subtree = render.call(renderContext)
    return renderVNode(subtree)
  }

  function renderVNode(vnode) {
    const type = typeof vnode.type
    if (type === "string") {
      return renderElementVNode(vnode)
    } else if (type === "object" || type === "function") {
      return renderComponentVNode(vnode)
    } else if (vnode.type === Text) {
      // ...
    } else if (vnode.type === Fragment) {
      // ...
    } else {
      // 其他类型
    }
  }

  // SSR 渲染元素
  function renderElementVNode(vnode) {
    const { type: tag, props, children } = vnode
    const isVoidElement = VOID_TAGS.split(",").includes(tag)

    let ret = `<${tag}`
    if (props) {
      ret += renderAttrs(props)
    }
    ret += isVoidElement ? `/>` : `>`

    if (isVoidElement) {
      return ret
    }

    if (typeof children === "string") {
      ret += children
    } else if (Array.isArray(children)) {
      children.forEach((child) => {
        ret += renderElementVNode(child)
      })
    }

    ret += `</${tag}>`
    return ret
  }

  function renderAttrs(props) {
    let ret = ""
    for (const key in props) {
      if (shouldIgnoreProp.includes(key) || /^on[^a-z]/.test(key)) {
        continue
      }
      const value = props[key]
      ret += renderDynamicAttr(key, value)
    }
    return ret
  }

  const isBooleanAttr = (key) =>
    (
      `itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly` +
      `,async,autofocus,autoplay,controls,default,defer,disabled,hidden,` +
      `loop,open,required,reversed,scoped,seamless,` +
      `checked,muted,multiple,selected`
    )
      .split(",")
      .includes(key)

  function renderDynamicAttr(key, value) {
    if (isBooleanAttr(key)) {
      return value === false ? `` : ` ${key}`
    } else if (isSSRSafeAttrName(key)) {
      return value === "" ? ` ${key}` : ` ${key}="${escapeHtml(value)}"`
    } else {
      console.warn(`[@vue/server-renderer] Skipped unsafe attr: ${key}`)
      return ``
    }
  }

  function escapeHtml(string) {
    const str = "" + string
    const match = escapeRE.exec(str)
    if (!match) {
      return str
    }
    let html = ""
    let escaped
    let index
    let lastIndex = 0
    for (index = match.index; index < str.length; index++) {
      switch (str.charCodeAt(index)) {
        case 34:
          escaped = "&quot;"
          break
        case 38:
          escaped = "&amp;"
          break
        case 39:
          escaped = "&#39;"
          break
        case 60:
          escaped = "&lt;"
          break
        case 62:
          escaped = "&gt;"
          break
        default:
          continue
      }
      if (lastIndex !== index) {
        html += str.substring(lastIndex, index)
      }
      lastIndex = index + 1
      html += escaped
    }
    return lastIndex !== index ? html + str.substring(lastIndex, index) : html
  }

  // 返回渲染器 API
  return {
    render,
    hydrate,
    renderComponentVNode,
  }
}

/****************************************************************************
 * 4. 用户示例：测试渲染器
 ***************************************************************************/
const renderer = createRenderer({
  createElement(tag) {
    return document.createElement(tag)
  },
  insert(child, parent, anchor) {
    parent.insertBefore(child, anchor || null)
  },
  setElementText(el, text) {
    el.textContent = text
  },
  createText(text) {
    return document.createTextNode(text)
  },
  setText(el, text) {
    el.nodeValue = text
  },
  createComment(text) {
    return document.createComment(text)
  },
  patchProps(el, key, prevValue, nextValue) {
    // 事件绑定
    if (/^on/.test(key)) {
      const invokers = el._vei || (el._vei = {})
      let invoker = invokers[key]
      const name = key.slice(2).toLowerCase()
      if (nextValue) {
        if (!invoker) {
          invoker = (e) => {
            if (Array.isArray(invoker.value)) {
              invoker.value.forEach((fn) => fn(e))
            } else {
              invoker.value(e)
            }
          }
          invokers[key] = invoker
          invoker.value = nextValue
          el.addEventListener(name, invoker)
        } else {
          invoker.value = nextValue
        }
      } else if (invoker) {
        el.removeEventListener(name, invoker)
        invokers[key] = null
      }
    }
    // class
    else if (key === "class") {
      el.className = nextValue || ""
    }
    // style
    else if (key === "style") {
      if (typeof nextValue === "string") {
        el.style.cssText = nextValue
      } else if (nextValue && typeof nextValue === "object") {
        if (prevValue && typeof prevValue === "object") {
          for (const styleName in prevValue) {
            if (!(styleName in nextValue)) {
              el.style[styleName] = ""
            }
          }
        }
        for (const styleName in nextValue) {
          el.style[styleName] = nextValue[styleName]
        }
      } else {
        el.removeAttribute("style")
      }
      return
    }
    // 其余属性
    else if (shouldSetAsProps(el, key, nextValue)) {
      const type = typeof el[key]
      if (type === "boolean" && nextValue === "") {
        el[key] = true
      } else {
        if (nextValue == null) {
          el.removeAttribute(key)
        } else {
          el[key] = nextValue
        }
      }
    } else {
      el.setAttribute(key, nextValue)
    }
  },
})

// 测试：服务端先产生 HTML
const html = renderer.renderComponentVNode(CompVNode)
console.log("SSR 产物：", html)

// 在浏览器容器中放入 SSR 产物
const container = document.querySelector("#app")
container.innerHTML = html

// 客户端同构：hydrate
renderer.hydrate(CompVNode, container)

// 另外的测试
const map = new Map()
map.set("name", "Alice")
map.set("age", 25)
console.table([...map])

/****************************************************************************
 * 5. 可能的工具函数
 ***************************************************************************/
function shouldSetAsProps(el, key, value) {
  if (key === "form" && el.tagName === "INPUT") {
    return true
  }
  return key in el
}
