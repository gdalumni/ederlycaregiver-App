import request from '@/utils/request'

export const recordTypes = [
  { key: 'bp', label: '血压', path: 'blood-pressure', perm: 'elderly:bp' },
  { key: 'glucose', label: '血糖', path: 'blood-glucose', perm: 'elderly:glucose' },
  { key: 'body', label: '身高体重', path: 'body-metric', perm: 'elderly:body' },
  { key: 'sleep', label: '睡眠', path: 'sleep', perm: 'elderly:sleep' },
  { key: 'medication', label: '用药', path: 'medication', perm: 'elderly:medication' }
]

function prefix(path, elderlyId) {
  return '/elderly/person/' + elderlyId + '/' + path
}

function pageQuery(query) {
  const source = query || {}
  const params = {}
  ;['pageNum', 'pageSize', 'beginTime', 'endTime', 'measureType'].forEach(function(key) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') {
      params[key] = source[key]
    }
  })
  return params
}

export function listRecords(path, elderlyId, query) {
  return request({
    url: prefix(path, elderlyId) + '/list',
    method: 'get',
    params: pageQuery(query)
  })
}

export function getRecord(path, elderlyId, recordId) {
  return request({
    url: prefix(path, elderlyId) + '/' + recordId,
    method: 'get'
  })
}

export function saveRecord(path, elderlyId, data, editing) {
  const body = Object.assign({}, data || {})
  delete body.elderlyId
  delete body.bmi
  delete body.durationMinutes
  if (!editing) {
    delete body.recordId
  }
  return request({
    url: prefix(path, elderlyId),
    method: editing ? 'put' : 'post',
    data: body
  })
}

export function removeRecords(path, elderlyId, recordIds) {
  return request({
    url: prefix(path, elderlyId) + '/' + recordIds,
    method: 'delete'
  })
}
