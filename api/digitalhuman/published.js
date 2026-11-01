import config from '@/config'
import { getToken } from '@/utils/auth'

/**
 * 已发布形象读取。只要登录，不看形象管理权限，也不弹全局 toast。
 * 调用方按 code 判断：默认形象缺失时继续用本地配置；列表为空时 data 是 []。
 */
function publishedGet(path) {
  return new Promise((resolve, reject) => {
    const header = {}
    const token = getToken()
    if (token) {
      header.Authorization = 'Bearer ' + token
    }
    uni.request({
      method: 'get',
      timeout: 10000,
      url: config.baseUrl + path,
      header: header,
      dataType: 'json'
    }).then(response => {
      const error = Array.isArray(response) ? response[0] : null
      const res = Array.isArray(response) ? response[1] : response
      if (error || !res || res.data == null) {
        reject(error || 'network')
        return
      }
      resolve(res.data)
    }).catch(reject)
  })
}

export function getPublishedDefault() {
  return publishedGet('/digitalhuman/published/default')
}

/** 已发布形象列表。data 只有 avatarCode、avatarName、releaseThumbnail、releaseVersion、defaultActive。 */
export function listPublished() {
  return publishedGet('/digitalhuman/published/list')
}

/** 按编码读取完整发布快照。default 和 list 是保留编码，不能当形象编码。 */
export function getPublished(avatarCode) {
  const code = avatarCode == null ? '' : String(avatarCode)
  if (!code || code === 'default' || code === 'list') {
    return Promise.reject(new Error('reserved avatar code'))
  }
  return publishedGet('/digitalhuman/published/' + encodeURIComponent(code))
}
