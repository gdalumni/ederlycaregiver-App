import mouthConfig from '@/static/digital-human/config.json'

/**
 * 把容器里的显示区域换成原图像素。
 * contain：完整显示底图，不裁切。底图和嘴型共用这个结果。
 */
export function fitContain(containerWidth, containerHeight, imageWidth, imageHeight) {
  const safeWidth = containerWidth > 0 ? containerWidth : 0
  const safeHeight = containerHeight > 0 ? containerHeight : 0
  if (!safeWidth || !safeHeight || !imageWidth || !imageHeight) {
    return { x: 0, y: 0, width: 0, height: 0, scale: 0 }
  }
  const scale = Math.min(safeWidth / imageWidth, safeHeight / imageHeight)
  const width = imageWidth * scale
  const height = imageHeight * scale
  return {
    x: (safeWidth - width) / 2,
    y: (safeHeight - height) / 2,
    width: width,
    height: height,
    scale: scale
  }
}

/**
 * 嘴型框，单位是原图像素。
 * contentX/contentY 是该张图里实测的皮肤块中心，不是画布几何中心。
 * 绘制时让这个点落在共用的 centerX/centerY 上，再加上该嘴型自己的偏移。
 */
export function mouthRectInImage(config, key) {
  const mouth = config.mouth
  const viseme = config.visemes[key] || config.visemes.rest
  const drawWidth = mouth.width * mouth.scale
  const drawHeight = mouth.height * mouth.scale
  const scaleX = drawWidth / viseme.canvasWidth
  const scaleY = drawHeight / viseme.canvasHeight
  return {
    x: mouth.centerX - viseme.contentX * scaleX + viseme.offsetX,
    y: mouth.centerY - viseme.contentY * scaleY + viseme.offsetY,
    width: drawWidth,
    height: drawHeight
  }
}

/** 原图像素矩形映射到当前容器里的同一套缩放结果。 */
export function imageRectToView(rect, fit) {
  return {
    left: fit.x + rect.x * fit.scale,
    top: fit.y + rect.y * fit.scale,
    width: rect.width * fit.scale,
    height: rect.height * fit.scale
  }
}

export function portraitRect(config) {
  const system = config && config.coordinateSystem ? config.coordinateSystem : mouthConfig.coordinateSystem
  return {
    x: 0,
    y: 0,
    width: system.referenceWidth,
    height: system.referenceHeight
  }
}

export { mouthConfig }
