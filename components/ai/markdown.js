/**
 * 聊天气泡用的轻量 Markdown。只覆盖标题、段落、列表、行内样式和围栏代码块。
 * 不生成 HTML，调用方用文本节点渲染。
 */

function parseInlines(text) {
  const source = text || ''
  const inlines = []
  const pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g
  let last = 0
  let match = pattern.exec(source)
  while (match) {
    if (match.index > last) {
      inlines.push({
        type: 'text',
        text: source.slice(last, match.index)
      })
    }
    const token = match[0]
    if (token.charAt(0) === '`') {
      inlines.push({
        type: 'code',
        text: token.slice(1, -1)
      })
    } else if (token.indexOf('**') === 0) {
      inlines.push({
        type: 'bold',
        text: token.slice(2, -2)
      })
    } else {
      inlines.push({
        type: 'italic',
        text: token.slice(1, -1)
      })
    }
    last = match.index + token.length
    match = pattern.exec(source)
  }
  if (last < source.length) {
    inlines.push({
      type: 'text',
      text: source.slice(last)
    })
  }
  return inlines
}

function isStructural(line) {
  return /^```/.test(line) ||
    /^#{1,3}\s+/.test(line) ||
    /^\s*[-*]\s+/.test(line) ||
    /^\s*\d+\.\s+/.test(line)
}

/**
 * @param {string} source
 * @returns {Array<Object>}
 */
export function parseMarkdown(source) {
  const text = source == null ? '' : String(source).replace(/\r\n/g, '\n')
  const lines = text.split('\n')
  const blocks = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    const fence = /^```([A-Za-z0-9_+-]*)\s*$/.exec(line)
    if (fence) {
      const lang = fence[1] || ''
      const code = []
      index += 1
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        code.push(lines[index])
        index += 1
      }
      if (index < lines.length) {
        index += 1
      }
      blocks.push({
        type: 'code',
        lang: lang,
        text: code.join('\n')
      })
      continue
    }
    if (!line.trim()) {
      index += 1
      continue
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line)
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1].length,
        inlines: parseInlines(heading[2])
      })
      index += 1
      continue
    }
    const unordered = /^\s*[-*]\s+(.*)$/.exec(line)
    const ordered = /^\s*\d+\.\s+(.*)$/.exec(line)
    if (unordered || ordered) {
      const items = []
      const asOrdered = !!ordered
      while (index < lines.length) {
        const item = asOrdered
          ? /^\s*\d+\.\s+(.*)$/.exec(lines[index])
          : /^\s*[-*]\s+(.*)$/.exec(lines[index])
        if (!item) {
          break
        }
        items.push(parseInlines(item[1]))
        index += 1
      }
      blocks.push({
        type: 'list',
        ordered: asOrdered,
        items: items
      })
      continue
    }
    const paragraph = []
    while (index < lines.length && lines[index].trim() && !isStructural(lines[index])) {
      paragraph.push(lines[index])
      index += 1
    }
    blocks.push({
      type: 'paragraph',
      inlines: parseInlines(paragraph.join('\n'))
    })
  }
  return blocks
}
