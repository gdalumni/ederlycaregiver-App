import request from '@/utils/request'

export function listDept() {
  return request({
    url: '/system/dept/list',
    method: 'get'
  })
}
