import request from '@/utils/request'

function listQuery(query) {
  const source = query || {}
  const params = {}
  ;['pageNum', 'pageSize', 'name', 'idCard', 'phonenumber', 'sex', 'status', 'deptId', 'beginTime', 'endTime'].forEach(function(key) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') {
      params[key] = source[key]
    }
  })
  return params
}

export function listPerson(query) {
  return request({
    url: '/elderly/person/list',
    method: 'get',
    params: listQuery(query)
  })
}

export function getPerson(elderlyId) {
  return request({
    url: '/elderly/person/' + elderlyId,
    method: 'get'
  })
}

export function getOwnPerson() {
  return request({
    url: '/elderly/person/own',
    method: 'get'
  })
}

export function ensureOwnPerson() {
  return request({
    url: '/elderly/person/own',
    method: 'post'
  })
}

/**
 * 新增不传 managerUserId，服务端写成当前用户。
 * 修改不传 managerUserId，服务端保留原绑定。
 * 身份证和电话按详情原样提交，页面不再打星号。
 */
export function savePerson(data, editing) {
  const source = data || {}
  const body = {
    deptId: source.deptId,
    name: source.name
  }
  if (editing) {
    body.elderlyId = source.elderlyId
  }
  ;['sex', 'idCard', 'birthday', 'phonenumber', 'address', 'emergencyContact', 'emergencyPhone', 'status', 'remark'].forEach(function(key) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') {
      body[key] = source[key]
    }
  })
  return request({
    url: '/elderly/person',
    method: editing ? 'put' : 'post',
    data: body
  })
}

export function removePerson(elderlyIds) {
  return request({
    url: '/elderly/person/' + elderlyIds,
    method: 'delete'
  })
}
