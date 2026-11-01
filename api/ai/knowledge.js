import request from '@/utils/request'

/**
 * 公共知识库。对话页不调用这组接口，知识问答走聊天。
 * 不要提交个人健康记录。
 */

export function addKnowledgeDocument(data) {
  const source = data || {}
  return request({
    url: '/ai/knowledge/documents',
    method: 'post',
    data: {
      title: source.title,
      source: source.source,
      category: source.category,
      content: source.content
    }
  })
}

export function removeKnowledgeDocument(documentId) {
  return request({
    url: '/ai/knowledge/documents/' + documentId,
    method: 'delete'
  })
}

function searchBody(data) {
  const source = data || {}
  const body = {
    query: source.query
  }
  if (source.topK !== undefined && source.topK !== null && source.topK !== '') {
    body.topK = source.topK
  }
  if (source.similarityThreshold !== undefined && source.similarityThreshold !== null && source.similarityThreshold !== '') {
    body.similarityThreshold = source.similarityThreshold
  }
  if (source.category) {
    body.category = source.category
  }
  return body
}

export function searchKnowledge(data) {
  return request({
    url: '/ai/knowledge/search',
    method: 'post',
    data: searchBody(data)
  })
}

export function answerKnowledge(data) {
  return request({
    url: '/ai/knowledge/answer',
    method: 'post',
    data: searchBody(data)
  })
}
