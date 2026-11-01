import upload from '@/utils/upload'

/**
 * 语音转文字。不创建聊天消息，也不选择意图。
 * 只上传 wav，字段名 audio。不要改走 /common/upload。
 * @param {string} filePath
 * @param {{language?: string, sessionId?: number|string, requestId?: string}} [extra]
 */
export function recognizeSpeech(filePath, extra) {
  const source = extra || {}
  const formData = {}
  if (source.language) {
    formData.language = source.language
  }
  if (source.sessionId !== undefined && source.sessionId !== null && source.sessionId !== '') {
    formData.sessionId = String(source.sessionId)
  }
  if (source.requestId) {
    formData.requestId = source.requestId
  }
  return upload({
    url: '/ai/asr/recognize',
    filePath: filePath,
    name: 'audio',
    formData: formData,
    timeout: 60000,
    skipErrorToast: true
  })
}

export function asrErrorMessage(error) {
  const text = String((error && (error.msg || error.message || error.errMsg)) || error || '')
  if (text.indexOf('audio format is not supported') >= 0) {
    return '当前录音不是 wav，也不是 16kHz 单声道 16bit 的原始音频，请改用文字'
  }
  if (text.indexOf('audio file is too large') >= 0) {
    return '录音不能超过 10MB'
  }
  if (text.indexOf('audio is too long') >= 0) {
    return '录音不能超过 60 秒'
  }
  if (text.indexOf('audio file is required') >= 0) {
    return '没有录音文件，请重新按住说话'
  }
  if (text.indexOf('default asr model is not configured') >= 0) {
    return '没有配置语音识别模型，请改用文字'
  }
  if (text.indexOf('audio file save failed') >= 0) {
    return '语音识别暂时失败，请改用文字'
  }
  if (text.indexOf('audio language is invalid') >= 0 || text.indexOf('requestId is invalid') >= 0) {
    return '录音失败，请改用文字'
  }
  return '录音失败，请改用文字'
}
