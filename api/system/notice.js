import config from '@/config'
import request from '@/utils/request'
import { getToken } from '@/utils/auth'

function noticeQuery(query) {
  const source = query || {}
  const params = {}
  ;['pageNum', 'pageSize', 'noticeTitle', 'noticeType', 'status'].forEach(function(key) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') {
      params[key] = source[key]
    }
  })
  return params
}

/** 通知公告列表。权限 system:notice:list。 */
export function listNotice(query) {
  return request({
    url: '/system/notice/list',
    method: 'get',
    params: noticeQuery(query)
  })
}

/** 通知公告详情。权限 system:notice:query。 */
export function getNotice(noticeId) {
  return request({
    url: '/system/notice/' + noticeId,
    method: 'get'
  })
}

/**
 * 首页滚动通知只取正常公告的标题。
 * 没有权限或接口失败时返回空数组，不弹出错误，也不使用占位文案。
 */
export function listOpenNotices() {
  return new Promise(resolve => {
    const header = {}
    const token = getToken()
    if (token) {
      header.Authorization = 'Bearer ' + token
    }
    uni.request({
      method: 'get',
      timeout: 10000,
      url: config.baseUrl + '/system/notice/list?pageNum=1&pageSize=10&status=0',
      header: header,
      dataType: 'json'
    }).then(response => {
      const error = Array.isArray(response) ? response[0] : null
      const res = Array.isArray(response) ? response[1] : response
      const body = res && res.data
      if (error || !body || body.code !== 200 || !Array.isArray(body.rows)) {
        resolve([])
        return
      }
      const titles = []
      body.rows.forEach(row => {
        if (!row || String(row.status) !== '0' || !row.noticeTitle) {
          return
        }
        const title = String(row.noticeTitle).trim()
        if (title) {
          titles.push(title)
        }
      })
      resolve(titles)
    }).catch(() => resolve([]))
  })
}
