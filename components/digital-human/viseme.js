const NAMED = {
  啊: 'open',
  呀: 'open',
  哈: 'open',
  大: 'open',
  哦: 'round',
  喔: 'round',
  波: 'round',
  摸: 'round',
  衣: 'wide',
  一: 'wide',
  西: 'wide',
  七: 'wide',
  呜: 'round',
  乌: 'round',
  出: 'round',
  嗯: 'closed',
  吗: 'closed',
  吧: 'closed',
  妈: 'closed'
}

const CYCLE = ['open', 'wide', 'round', 'narrow', 'closed']

/**
 * 按字符选嘴型。贴图是 rest、closed、open、wide、round、narrow。
 * 没有语音时间戳，只能跟着文字走。
 * @param {string} char
 * @returns {'rest'|'closed'|'open'|'wide'|'round'|'narrow'}
 */
export function visemeOf(char) {
  if (!char || /\s/.test(char)) {
    return 'rest'
  }
  if (/[，。！？、；：,.!?;:]/.test(char)) {
    return 'closed'
  }
  if (NAMED[char]) {
    return NAMED[char]
  }
  const code = char.charCodeAt(0)
  if (code < 32) {
    return 'rest'
  }
  return CYCLE[code % CYCLE.length]
}
