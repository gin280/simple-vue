/***************************************************************************
 * 1. 工具函数与全局常量
 ***************************************************************************/
// 移除标签之间的多余空格或换行
export function removeBetweenTags(html) {
  return html
    .replace(/>\s+</g, "><") // 只匹配 `>` 后面紧跟空白，再紧跟 `<`，替换成 `><`
    .trim()
}

// 定义状态机的状态
export const State = {
  initial: 1, // 初始状态
  tagOpen: 2, // 标签开始状态
  tagName: 3, // 标签名称状态
  text: 4, // 文本状态
  tagEnd: 5, // 标签结束状态
  tagEndName: 6, // 结束标签名称状态
}

// 工具：判断是否字母
export function isAlpha(char) {
  return /^[A-Za-z]$/.test(char)
}

// 工具：判断是否空白字符
export function isWhitespace(char) {
  return /\s/.test(char)
}

// 命名字符引用表
export const namedCharacterReferences = {
  gt: ">",
  "gt;": ">",
  lt: "<",
  "lt;": "<",
  ltcc: "⪦",
}

// CCR_REPLACEMENTS
const CCR_REPLACEMENTS = {
  0x80: 0x20ac,
  0x82: 0x201a,
  0x83: 0x0192,
  0x84: 0x201e,
  0x85: 0x2026,
  0x86: 0x2020,
  0x87: 0x2021,
  0x88: 0x02c6,
  0x89: 0x2030,
  0x8a: 0x0160,
  0x8b: 0x2039,
  0x8c: 0x0152,
  0x8e: 0x017d,
  0x91: 0x2018,
  0x92: 0x2019,
  0x93: 0x201c,
  0x94: 0x201d,
  0x95: 0x2022,
  0x96: 0x2013,
  0x97: 0x2014,
  0x98: 0x02dc,
  0x99: 0x2122,
  0x9a: 0x0161,
  0x9b: 0x203a,
  0x9c: 0x0153,
  0x9e: 0x017e,
  0x9f: 0x0178,
}

/***************************************************************************
 * 2. 分词（tokenize）
 ***************************************************************************/
export function tokenize(str) {
  let currentState = State.initial
  const chars = []
  const tokens = []

  while (str.length > 0) {
    const char = str[0]
    switch (currentState) {
      case State.initial:
        if (char === "<") {
          currentState = State.tagOpen
          str = str.slice(1)
        } else if (isAlpha(char)) {
          currentState = State.text
          chars.push(char)
          str = str.slice(1)
        } else if (isWhitespace(char)) {
          str = str.slice(1) // 忽略
        } else {
          currentState = State.text
          chars.push(char)
          str = str.slice(1)
        }
        break

      case State.tagOpen:
        if (isAlpha(char)) {
          currentState = State.tagName
          chars.push(char)
          str = str.slice(1)
        } else if (char === "/") {
          currentState = State.tagEnd
          str = str.slice(1)
        } else if (isWhitespace(char)) {
          str = str.slice(1)
        } else {
          str = str.slice(1) // 可能非法
        }
        break

      case State.tagName:
        if (isAlpha(char)) {
          chars.push(char)
          str = str.slice(1)
        } else if (char === ">") {
          currentState = State.initial
          tokens.push({
            type: "tag",
            name: chars.join(""),
          })
          chars.length = 0
          str = str.slice(1)
        } else if (isWhitespace(char)) {
          str = str.slice(1)
        } else {
          str = str.slice(1)
        }
        break

      case State.text:
        if (isAlpha(char)) {
          chars.push(char)
          str = str.slice(1)
        } else if (char === "<") {
          currentState = State.tagOpen
          tokens.push({
            type: "text",
            content: chars.join(""),
          })
          chars.length = 0
          str = str.slice(1)
        } else if (isWhitespace(char)) {
          chars.push(char)
          str = str.slice(1)
        } else {
          chars.push(char)
          str = str.slice(1)
        }
        break

      case State.tagEnd:
        if (isAlpha(char)) {
          currentState = State.tagEndName
          chars.push(char)
          str = str.slice(1)
        } else if (isWhitespace(char)) {
          str = str.slice(1)
        } else {
          str = str.slice(1)
        }
        break

      case State.tagEndName:
        if (isAlpha(char)) {
          chars.push(char)
          str = str.slice(1)
        } else if (char === ">") {
          currentState = State.initial
          tokens.push({
            type: "tagEnd",
            name: chars.join(""),
          })
          chars.length = 0
          str = str.slice(1)
        } else if (isWhitespace(char)) {
          str = str.slice(1)
        } else {
          str = str.slice(1)
        }
        break

      default:
        str = str.slice(1)
        break
    }
  }

  // 收尾：若缓存中还有文本
  if (chars.length > 0) {
    tokens.push({
      type: currentState === State.text ? "text" : "unknown",
      content: chars.join(""),
    })
  }

  return tokens
}

/***************************************************************************
 * 3. 解析（parse） => 生产 AST
 ***************************************************************************/
export function _parse(str) {
  const tokens = tokenize(str)
  const root = { type: "Root", children: [] }
  const elementStack = [root]

  while (tokens.length) {
    const parent = elementStack[elementStack.length - 1]
    const t = tokens[0]
    switch (t.type) {
      case "tag": {
        const elementNode = {
          type: "Element",
          tag: t.name,
          children: [],
        }
        parent.children.push(elementNode)
        elementStack.push(elementNode)
        break
      }
      case "text": {
        const textNode = {
          type: "Text",
          content: t.content,
        }
        parent.children.push(textNode)
        break
      }
      case "tagEnd": {
        elementStack.pop()
        break
      }
    }
    tokens.shift()
  }
  return root
}

// 文本模式
export const TextModes = {
  DATA: "DATA",
  RCDATA: "RCDATA",
  RAWTEXT: "RAWTEXT",
  CDATA: "CDATA",
}

// 富 parse: 包含注释、CDATA、插值等
export function parse(str) {
  const context = {
    source: str,
    mode: TextModes.DATA,
    advanceBy(num) {
      context.source = context.source.slice(num)
    },
    advanceSpaces() {
      const match = /^[\t\r\n\f ]+/.exec(context.source)
      if (match) {
        context.advanceBy(match[0].length)
      }
    },
  }

  const nodes = parseChildren(context, [])
  return {
    type: "Root",
    children: nodes,
  }
}

function parseChildren(context, ancestors) {
  const nodes = []
  while (!isEnd(context, ancestors)) {
    const { mode, source } = context
    let node = null

    if (mode === TextModes.DATA || mode === TextModes.RCDATA) {
      if (mode === TextModes.DATA && source.startsWith("<")) {
        if (source.startsWith("<!--")) {
          node = parseComment(context)
        } else if (source.startsWith("<![CDATA[")) {
          // node = parseCDATA(...)
        } else if (source.startsWith("</")) {
          console.error("无效的结束标签")
          continue
        } else if (/^<[a-z]/i.test(source)) {
          node = parseElement(context, ancestors)
        } else {
          node = parseText(context)
        }
      } else if (source.startsWith("{{")) {
        node = parseInterpolation(context)
      }
    }

    if (!node) {
      node = parseText(context)
    }
    nodes.push(node)
  }
  return nodes
}

function isEnd(context, ancestors) {
  if (!context.source) return true
  for (let i = ancestors.length - 1; i >= 0; --i) {
    const closingTag = `</${ancestors[i].tag}>`
    if (context.source.startsWith(closingTag)) {
      return true
    }
  }
  return false
}

function parseElement(context, ancestors) {
  const element = parseTag(context)
  if (element.isSelfClosing) return element

  if (element.tag === "textarea" || element.tag === "title") {
    context.mode = TextModes.RCDATA
  } else if (/style|xmp|iframe|noembed|noframes|noscript/.test(element.tag)) {
    context.mode = TextModes.RAWTEXT
  } else {
    context.mode = TextModes.DATA
  }

  ancestors.push(element)
  element.children = parseChildren(context, ancestors)
  ancestors.pop()

  if (context.source.startsWith(`</${element.tag}`)) {
    parseTag(context, "end")
  } else {
    console.error(`${element.tag} 标签缺少闭合标签`)
  }
  return element
}

function parseTag(context, type = "start") {
  const { advanceBy, advanceSpaces } = context
  const match =
    type === "start"
      ? /^<([a-z][^\t\r\n\f />]*)/i.exec(context.source)
      : /^<\/([a-z][^\t\r\n\f />]*)/i.exec(context.source)

  const tag = match[1]
  advanceBy(match[0].length)
  advanceSpaces()

  const props = parseAttributes(context)

  const isSelfClosing = context.source.startsWith("/>")
  advanceBy(isSelfClosing ? 2 : 1)

  return {
    type: "Element",
    tag,
    props,
    children: [],
    isSelfClosing,
  }
}

function parseAttributes(context) {
  const { advanceBy, advanceSpaces } = context
  const props = []
  while (!context.source.startsWith(">") && !context.source.startsWith("/>")) {
    const match = /^[^\t\r\n\f />][^\t\r\n\f />=]*/.exec(context.source)
    const name = match[0]
    advanceBy(name.length)
    advanceSpaces()
    advanceBy(1) // =
    advanceSpaces()

    let value = ""
    const quote = context.source[0]
    const isQuoted = quote === '"' || quote === "'"
    if (isQuoted) {
      advanceBy(1)
      const endQuoteIndex = context.source.indexOf(quote)
      if (endQuoteIndex > -1) {
        value = context.source.slice(0, endQuoteIndex)
        advanceBy(value.length)
        advanceBy(1)
      } else {
        console.error("缺少引号")
      }
    } else {
      const match = /^[^\t\r\n\f >]+/.exec(context.source)
      value = match[0]
      advanceBy(value.length)
    }

    advanceSpaces()

    props.push({
      type: "Attribute",
      name,
      value,
    })
  }
  return props
}

export function parseText(context) {
  let endIndex = context.source.length
  const ltIndex = context.source.indexOf("<")
  const delimiterIndex = context.source.indexOf("{{")

  if (ltIndex > -1 && ltIndex < endIndex) {
    endIndex = ltIndex
  }
  if (delimiterIndex > -1 && delimiterIndex < endIndex) {
    endIndex = delimiterIndex
  }

  const content = context.source.slice(0, endIndex)
  context.advanceBy(content.length)

  return {
    type: "Text",
    content: decodeHtml(content),
  }
}

// 解析插值
export function parseInterpolation(context) {
  context.advanceBy("{{".length)
  let closeIndex = context.source.indexOf("}}")
  if (closeIndex < 0) {
    console.error("插值缺少结束定界符")
  }
  const content = context.source.slice(0, closeIndex)
  context.advanceBy(content.length)
  context.advanceBy("}}".length)

  return {
    type: "Interpolation",
    content: {
      type: "Expression",
      content: decodeHtml(content),
    },
  }
}

// 解析注释
export function parseComment(context) {
  context.advanceBy("<!--".length)
  let closeIndex = context.source.indexOf("-->")
  const content = context.source.slice(0, closeIndex)
  context.advanceBy(content.length)
  context.advanceBy("-->".length)
  return {
    type: "Comment",
    content,
  }
}

/***************************************************************************
 * 4. 转换（transform）：对 AST 节点进行处理
 ***************************************************************************/
export function transform(ast) {
  const context = {
    currentNode: null,
    childIndex: 0,
    parent: null,
    replaceNode(node) {
      context.parent.children[context.childIndex] = node
      context.currentNode = node
    },
    removeNode() {
      context.parent.children.splice(context.childIndex, 1)
      context.currentNode = null
    },
    nodeTransforms: [transformRoot, transformElement, transformText],
  }

  traverseNode(ast, context)
  dump(ast) // 打印 AST 看看
}

function traverseNode(ast, context) {
  context.currentNode = ast
  const exitFns = []
  for (const transform of context.nodeTransforms) {
    const onExit = transform(context.currentNode, context)
    if (onExit) exitFns.push(onExit)
    if (!context.currentNode) return
  }

  const children = context.currentNode.children
  if (children) {
    for (let i = 0; i < children.length; i++) {
      context.parent = context.currentNode
      context.childIndex = i
      traverseNode(children[i], context)
    }
  }

  let i = exitFns.length
  while (i--) {
    exitFns[i]()
  }
}

// 转换：Element
function transformElement(node) {
  return () => {
    if (node.type !== "Element") return

    const callExp = createCallExpression("h", [createStringLiteral(node.tag)])
    if (node.children.length === 1) {
      callExp._arguments.push(node.children[0].jsNode)
    } else {
      callExp._arguments.push(createArrayExpression(node.children.map((c) => c.jsNode)))
    }
    node.jsNode = callExp
  }
}

// 转换：Text
function transformText(node) {
  if (node.type !== "Text") return
  node.jsNode = createStringLiteral(node.content)
}

// 转换：Root
function transformRoot(node) {
  return () => {
    if (node.type !== "Root") return
    const vnodeJSAST = node.children[0].jsNode
    node.jsNode = {
      type: "FunctionDecl",
      id: { type: "Identifier", name: "render" },
      params: [],
      body: [
        {
          type: "ReturnStatement",
          return: vnodeJSAST,
        },
      ],
    }
  }
}

// 调试打印
export function dump(node, indent = 0) {
  const type = node.type
  const desc = type === "Root" ? "" : type === "Element" ? node.tag : node.content
  console.log(`${"-".repeat(indent)}${type}: ${desc}`)
  if (node.children) {
    node.children.forEach((n) => dump(n, indent + 2))
  }
}

/***************************************************************************
 * 5. 代码生成（generate）
 ***************************************************************************/
export function compile(template) {
  // 1. 解析 => 得到 AST
  const ast = parse(template)
  // 2. 转换 => 每个节点生成对应的 jsNode
  transform(ast)
  // 3. 代码生成 => 返回最终渲染函数的字符串
  return generate(ast.jsNode)
}

export function generate(node) {
  const context = {
    code: "",
    currentIndent: 0,
    push(str) {
      context.code += str
    },
    newline() {
      context.code += "\n" + `  `.repeat(context.currentIndent)
    },
    indent() {
      context.currentIndent++
      context.newline()
    },
    deIndent() {
      context.currentIndent--
      context.newline()
    },
  }
  genNode(node, context)
  return context.code
}

function genNode(node, context) {
  switch (node.type) {
    case "FunctionDecl":
      genFunctionDecl(node, context)
      break
    case "ReturnStatement":
      genReturnStatement(node, context)
      break
    case "CallExpression":
      genCallExpression(node, context)
      break
    case "StringLiteral":
      genStringLiteral(node, context)
      break
    case "ArrayExpression":
      genArrayExpression(node, context)
      break
  }
}

function genFunctionDecl(node, context) {
  const { push, indent, deIndent } = context
  push(`function ${node.id.name}(`)
  genNodeList(node.params, context)
  push(`) {`)
  indent()
  node.body.forEach((n) => genNode(n, context))
  deIndent()
  push(`}`)
}

function genNodeList(nodes, context) {
  const { push } = context
  for (let i = 0; i < nodes.length; i++) {
    genNode(nodes[i], context)
    if (i < nodes.length - 1) {
      push(`, `)
    }
  }
}
zz

function genArrayExpression(node, context) {
  const { push } = context
  push(`[`)
  genNodeList(node.elements, context)
  push(`]`)
}

function genReturnStatement(node, context) {
  const { push } = context
  push(`return `)
  genNode(node.return, context)
}

function genStringLiteral(node, context) {
  const { push } = context
  push(`'${node.value}'`)
}

function genCallExpression(node, context) {
  const { push } = context
  const { callee, _arguments } = node
  push(`${callee.name}(`)
  genNodeList(_arguments, context)
  push(`)`)
}

/***************************************************************************
 * 6. JS AST 辅助创建函数
 ***************************************************************************/
export function createStringLiteral(value) {
  return {
    type: "StringLiteral",
    value,
  }
}

export function createIdentifier(name) {
  return {
    type: "Identifier",
    name,
  }
}

export function createArrayExpression(elements) {
  return {
    type: "ArrayExpression",
    elements,
  }
}

export function createCallExpression(callee, _arguments) {
  return {
    type: "CallExpression",
    callee: createIdentifier(callee),
    _arguments,
  }
}

/***************************************************************************
 * 7. 小示例调用
 ***************************************************************************/
// let template = `
//   <div>
//    <p class="a" id="2">Vue</p>
//    <p>Template</p>
//   </div>
// `
let template = `<div><!-- comments --></div>`
// template = removeBetweenTags(template)
console.log("原始模板：", template)

// 测试解析
console.log("AST：", parse(template))

// 若要编译成渲染函数：
const code = compile(template)
console.log("编译结果：\n", code)
