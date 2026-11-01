import store from '@/store'
import config from '@/config'
import { getToken } from '@/utils/auth'
import errorCode from '@/utils/errorCode'
import { toast, showConfirm, tansParams } from '@/utils/common'

let timeout = 10000
const baseUrl = config.baseUrl

const upload = config => {
  // 是否需要设置 token
  const isToken = (config.headers || {}).isToken === false
  config.header = config.header || {}
  if (getToken() && !isToken) {
    config.header['Authorization'] = 'Bearer ' + getToken()
  }
  // get请求映射params参数
  if (config.params) {
    let url = config.url + '?' + tansParams(config.params)
    url = url.slice(0, -1)
    config.url = url
  }
  return new Promise((resolve, reject) => {
      uni.uploadFile({
        timeout: config.timeout || timeout,
        url: baseUrl + config.url,
        filePath: config.filePath,
        name: config.name || 'file',
        header: config.header,
        formData: config.formData,
        success: (res) => {
          let result = JSON.parse(res.data)
          const code = result.code || 200
          const msg = errorCode[code] || result.msg || errorCode['default']
          if (code === 200) {
            resolve(result)
          } else if (code == 401) {
            showConfirm("登录状态已过期，您可以继续留在该页面，或者重新登录?").then(res => {
              if (res.confirm) {
                store.dispatch('LogOut').then(res => {
                  uni.reLaunch({ url: '/pages/login/login' })
                })
              }
            })
            const expired = '无效的会话，或者会话已过期，请重新登录。'
            if (config.skipErrorToast) {
              const error = new Error(expired)
              error.msg = expired
              reject(error)
            } else {
              reject(expired)
            }
          } else if (code === 500) {
            rejectUpload(config, reject, '500', msg)
          } else if (code !== 200) {
            rejectUpload(config, reject, code, msg)
          }
        },
        fail: (error) => {
          let message = (error && (error.errMsg || error.message)) || '上传失败'
          if (message === 'Network Error') {
            message = '后端接口连接异常'
          } else if (message.indexOf('timeout') >= 0) {
            message = '系统接口请求超时'
          } else if (message.indexOf('Request failed with status code') >= 0) {
            message = '系统接口' + message.substr(message.length - 3) + '异常'
          }
          rejectUpload(config, reject, error, message)
        }
      })
  })
}

function rejectUpload(config, reject, payload, msg) {
  if (!config.skipErrorToast) {
    toast(msg)
    reject(payload)
    return
  }
  const error = new Error(msg || '上传失败')
  error.msg = msg
  reject(error)
}

export default upload
