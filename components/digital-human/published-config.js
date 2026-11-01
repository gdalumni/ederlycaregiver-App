const VISEMES = ['rest', 'closed', 'open', 'wide', 'round', 'narrow']

function finiteNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value)
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return Number.isFinite(Number(value))
  }
  return false
}

function positiveNumber(value) {
  return finiteNumber(value) && Number(value) > 0
}

/**
 * 资源路径接到接口主机后面。本地兜底文件仍走包内静态目录。
 * 已是完整地址或 /static/ 时原样使用，不追加查询参数。
 */
export function resolveAssetUrl(baseUrl, file) {
  if (file == null || file === '') {
    return ''
  }
  const value = String(file)
  if (/^https?:\/\//i.test(value) || value.indexOf('/static/') === 0) {
    return value
  }
  if (value.charAt(0) === '/') {
    return String(baseUrl || '').replace(/\/+$/, '') + value
  }
  return '/static/digital-human/' + value.replace(/^\/+/, '')
}

export function sameRelease(left, right) {
  if (left == null || left === '' || right == null || right === '') {
    return false
  }
  return String(left) === String(right)
}

/** 已发布快照必须是第 2 节的结构，并且六张嘴型齐全。 */
export function isPublishedConfig(data) {
  if (!data || typeof data !== 'object') {
    return false
  }
  if (Number(data.schemaVersion) !== 2) {
    return false
  }
  if (!sameRelease(data.releaseVersion, data.releaseVersion)) {
    return false
  }
  const system = data.coordinateSystem
  if (!system || system.space !== 'source-image-pixels') {
    return false
  }
  if (!positiveNumber(system.referenceWidth) || !positiveNumber(system.referenceHeight)) {
    return false
  }
  if (typeof data.sourceImage !== 'string' || !data.sourceImage) {
    return false
  }
  const mouth = data.mouth
  if (!mouth || !finiteNumber(mouth.centerX) || !finiteNumber(mouth.centerY)) {
    return false
  }
  if (!positiveNumber(mouth.width) || !positiveNumber(mouth.height) || !positiveNumber(mouth.scale)) {
    return false
  }
  const visemes = data.visemes
  if (!visemes || typeof visemes !== 'object') {
    return false
  }
  const keys = Object.keys(visemes)
  if (keys.length !== VISEMES.length) {
    return false
  }
  for (let i = 0; i < VISEMES.length; i += 1) {
    const item = visemes[VISEMES[i]]
    if (!item || typeof item.file !== 'string' || !item.file) {
      return false
    }
    if (!positiveNumber(item.canvasWidth) || !positiveNumber(item.canvasHeight)) {
      return false
    }
    if (!finiteNumber(item.contentX) || !finiteNumber(item.contentY)) {
      return false
    }
    if (!finiteNumber(item.offsetX) || !finiteNumber(item.offsetY)) {
      return false
    }
  }
  return true
}

export function publishedImageFiles(config) {
  const files = [config.sourceImage]
  for (let i = 0; i < VISEMES.length; i += 1) {
    files.push(config.visemes[VISEMES[i]].file)
  }
  return files
}
