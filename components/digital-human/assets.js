import mouthConfig from '@/static/digital-human/config.json'
import appConfig from '@/config'
import { resolveAssetUrl } from '@/components/digital-human/published-config'

export const REFERENCE_WIDTH = mouthConfig.coordinateSystem.referenceWidth
export const REFERENCE_HEIGHT = mouthConfig.coordinateSystem.referenceHeight

export function cloneMouthConfig() {
  return JSON.parse(JSON.stringify(mouthConfig))
}

export function isMouthCalibrationBuild() {
  return process.env.NODE_ENV !== 'production'
}

export const MOUTH_STATES = [
  { key: 'rest', label: '静息' },
  { key: 'closed', label: '闭合' },
  { key: 'open', label: '张开' },
  { key: 'wide', label: '扁宽' },
  { key: 'round', label: '圆唇' },
  { key: 'narrow', label: '窄口' }
]

export function assetSrc(file) {
  return resolveAssetUrl(appConfig.baseUrl, file)
}

export function mouthSrc(config, key) {
  const viseme = config.visemes[key] || config.visemes.rest
  return assetSrc(viseme.file)
}

export const DIGITAL_HUMAN = {
  portrait: assetSrc(mouthConfig.sourceImage)
}
