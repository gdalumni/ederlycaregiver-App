import request from '@/utils/request'

/**
 * 聊天页只查询启用中的 chat 模型。
 * asr 和 rerank 不进入下拉。不提交、不读取 apiKey。
 * @param {{pageNum?: number, pageSize?: number}} [query]
 */
export function listChatModels(query) {
  const params = Object.assign({
    pageNum: 1,
    pageSize: 50,
    modelType: 'chat',
    status: '0'
  }, query)
  delete params.userId
  delete params.apiKey
  delete params.apiKeyEnc
  delete params.baseUrl
  return request({
    url: '/ai/model/list',
    method: 'get',
    params: params
  })
}
