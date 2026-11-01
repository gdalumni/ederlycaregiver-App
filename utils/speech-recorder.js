const DENY = '\u8bf7\u5728\u7cfb\u7edf\u8bbe\u7f6e\u91cc\u5141\u8bb8\u9ea6\u514b\u98ce\uff0c\u4e5f\u53ef\u4ee5\u76f4\u63a5\u6253\u5b57'
const AGAIN = '\u5df2\u5141\u8bb8\u9ea6\u514b\u98ce\uff0c\u8bf7\u518d\u6b21\u6309\u4f4f\u8bf4\u8bdd'
const FORMAT_ERROR = '\u5f53\u524d\u8bbe\u5907\u4e0d\u80fd\u6309\u8981\u6c42\u5f55\u97f3\uff0c\u8bf7\u6539\u7528\u6587\u5b57'
const SHORT_ERROR = '\u8bf4\u8bdd\u65f6\u95f4\u592a\u77ed\uff0c\u8bf7\u6309\u4f4f\u518d\u8bf4'
const FAIL_ERROR = '\u5f55\u97f3\u5931\u8d25\uff0c\u8bf7\u6539\u7528\u6587\u5b57'
const IOS_GRANTED = 1735552628
const IOS_DENIED = 1684369017

let h5Known = false
let androidPcmKnownSilent = false
let androidCaptureBusy = false
let androidCaptureRoute = ''
let cachedAndroidLabel = ''

export function permissionDeniedMessage() {
  return DENY
}

export function permissionGrantedAgainMessage() {
  return AGAIN
}

export function recordingTooShortMessage() {
  return SHORT_ERROR
}

export function recordingTooShort(duration) {
  const value = Number(duration)
  if (!(value > 0)) {
    return false
  }
  if (value >= 50) {
    return value < 800
  }
  return value < 0.8
}

export function recordingTooLong(duration) {
  const value = Number(duration)
  if (!(value > 0)) {
    return false
  }
  if (value >= 50) {
    return value > 60000
  }
  return value > 60
}

export function recorderErrorMessage(error) {
  const code = Number(error && (error.errCode || error.code))
  const text = String((error && (error.errMsg || error.message)) || '')
  if (code === 1107601 || /permission|denied|not authorized|microphone|\u9ea6\u514b\u98ce|\u6743\u9650/i.test(text)) {
    return DENY
  }
  if (code === 1107605 || /format|unsupported|\u683c\u5f0f/i.test(text)) {
    return FORMAT_ERROR
  }
  if (code === 7 || /too short|\u65f6\u95f4\u4e0d\u8db3/i.test(text)) {
    return SHORT_ERROR
  }
  return FAIL_ERROR
}

export function ensureMicPermission() {
  if (isAndroidLike()) {
    return androidMicPermission()
  }
  if (typeof plus !== 'undefined' && plus.os && plus.os.name === 'iOS') {
    return iosMicPermission()
  }
  return h5MicPermission()
}

export function recordStartPlan() {
  return {
    wrapPcm: false,
    options: recorderOptions('wav')
  }
}

export function recordFallbackPlan() {
  return {
    wrapPcm: true,
    options: recorderOptions('pcm')
  }
}

export function isRecorderFormatError(error) {
  const code = Number(error && (error.errCode || error.code))
  const text = String((error && (error.errMsg || error.message)) || '')
  return code === 1107605 || /format|unsupported|\u683c\u5f0f/i.test(text)
}

export function prepareWavFile(filePath, wrapPcm) {
  return readFileBuffer(filePath).then(function(data) {
    const bytes = bytesOf(data)
    if (!bytes.byteLength || isBlankAudio(bytes)) {
      return { error: FORMAT_ERROR }
    }
    if (isAmr(bytes)) {
      return amrFileToWav(filePath, bytes)
    }
    if (isRejectedAudio(bytes)) {
      return { error: FORMAT_ERROR }
    }
    if (isWave(bytes)) {
      if (isWavName(filePath)) {
        return { filePath: filePath }
      }
      return writeBytes(bytes).then(function(path) {
        return { filePath: path }
      })
    }
    if (!wrapPcm) {
      return { error: FORMAT_ERROR }
    }
    if (bytes.byteLength < 25600) {
      return { error: SHORT_ERROR }
    }
    return writeBytes(new Uint8Array(buildWav(bytes))).then(function(path) {
      return { filePath: path }
    })
  }).catch(function() {
    return { error: FORMAT_ERROR }
  })
}

function isAndroidLike() {
  if (typeof plus === 'undefined' || !plus.android) {
    return false
  }
  const name = plus.os ? String(plus.os.name || '') : ''
  if (name === 'Android' || /harmony/i.test(name)) {
    return true
  }
  try {
    const info = uni.getSystemInfoSync()
    const osName = String((info && (info.osName || info.platform)) || '')
    return /android|harmony/i.test(osName)
  } catch (error) {
    return false
  }
}

function recorderOptions(format) {
  return {
    duration: 60000,
    sampleRate: 16000,
    numberOfChannels: 1,
    encodeBitRate: 96000,
    format: format
  }
}

export function canUseAndroidPcm() {
  return isAndroidLike() && androidCaptureRoute === 'bulk'
}

export function learnAndroidCapture() {
  if (androidCaptureBusy || androidCaptureRoute || !isAndroidLike() || !micAlreadyGranted()) {
    return
  }
  const profiles = []
  androidProfiles().forEach(function(profile) {
    if (profile.rate === 16000 && profile.channel === 16) {
      profiles.push(profile)
    }
  })
  let bestLabel = ''
  let bestPeak = 0
  for (let index = 0; index < profiles.length; index += 1) {
    const opened = openAndroidRecorder(profiles[index])
    if (!opened) {
      continue
    }
    let peak = 0
    try {
      const chunk = readBulkOnce(opened.recorder, opened.readSize)
      peak = chunk ? peakAmplitude(chunk) : 0
    } catch (error) {
      peak = 0
    }
    releaseRecorder(opened.recorder)
    if (peak > bestPeak) {
      bestPeak = peak
      bestLabel = profiles[index].label
    }
  }
  if (!(bestPeak > 0)) {
    androidCaptureRoute = 'system'
    androidPcmKnownSilent = true
    cachedAndroidLabel = ''
    return
  }
  androidCaptureRoute = 'bulk'
  androidPcmKnownSilent = false
  cachedAndroidLabel = bestLabel
}

export function describeAndroidRecordProbe() {
  const lines = []
  try {
    lines.push('AudioRecord ' + readAndroidMinBufferSize().detail)
  } catch (error) {
    lines.push('AudioRecord 最小缓冲异常')
  }
  lines.push(byteBufferSelfCheck())
  const profiles = androidProfiles()
  for (let index = 0; index < profiles.length; index += 1) {
    try {
      lines.push(measureAndroidProfile(profiles[index]))
    } catch (error) {
      lines.push('AudioRecord ' + profiles[index].label + ' 异常')
    }
  }
  return lines
}

export function describeDecodedPeak(filePath, bytes) {
  try {
    const pcm = decodeAmrToPcm(filePath, bytesOf(bytes))
    if (!pcm || !pcm.length) {
      return '解码失败'
    }
    return '解码峰值=' + peakAmplitude(pcm) + ' 解码字节=' + pcm.length
  } catch (error) {
    return '解码失败'
  }
}

export function readAndroidMinBufferSize() {
  const attempts = []
  let size = 0
  function take(label, value) {
    attempts.push(label + '=' + value)
    const number = Number(value)
    if (number > 0 && !size) {
      size = number
    }
  }
  try {
    const AudioRecord = plus.android.importClass('android.media.AudioRecord')
    try {
      take('direct', AudioRecord.getMinBufferSize(16000, 16, 2))
    } catch (error) {
      attempts.push('direct异常=' + (error && error.message ? error.message : error))
    }
    try {
      take('invoke', plus.android.invoke(AudioRecord, 'getMinBufferSize', 16000, 16, 2))
    } catch (error) {
      attempts.push('invoke异常=' + (error && error.message ? error.message : error))
    }
  } catch (error) {
    attempts.push('导入异常=' + (error && error.message ? error.message : error))
  }
  return {
    size: size,
    detail: attempts.join(' | ')
  }
}

export function startAndroidPcmCapture(handlers) {
  const onStart = handlers && handlers.onStart ? handlers.onStart : function() {}
  const onStop = handlers && handlers.onStop ? handlers.onStop : function() {}
  const onError = handlers && handlers.onError ? handlers.onError : function() {}
  let recorder = null
  let timer = null
  let stopped = false
  let startedAt = 0
  let sampleRate = 16000
  let channels = 1
  let useDirect = false
  let readSize = 0
  let directBuffer = null
  let captured = 0
  const chunks = []

  function clearTimer() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  function failEmpty() {
    stopped = true
    androidCaptureBusy = false
    clearTimer()
    releaseRecorder(recorder)
    recorder = null
    onError({ errMsg: FORMAT_ERROR, empty: true })
  }

  function pullChunk() {
    if (!recorder) {
      return null
    }
    if (useDirect) {
      directBuffer.clear()
      const count = Number(plus.android.invoke(recorder, 'read', directBuffer, readSize))
      if (!(count > 0)) {
        return null
      }
      const even = count - (count % 2)
      directBuffer.position(0)
      directBuffer.limit(even)
      return heapCopy(directBuffer, even)
    }
    const buffer = newByteArray(readSize)
    const count = Number(plus.android.invoke(recorder, 'read', buffer, 0, readSize))
    if (!(count > 0)) {
      return null
    }
    return pcmChunk(buffer, count)
  }

  androidCaptureBusy = true
  try {
    const chosen = chooseLiveCapture()
    if (!chosen) {
      failEmpty()
      return { stop: function() {} }
    }
    recorder = chosen.recorder
    readSize = chosen.readSize
    sampleRate = chosen.sampleRate
    channels = chosen.channels
    useDirect = chosen.useDirect
    if (useDirect) {
      const ByteBuffer = plus.android.importClass('java.nio.ByteBuffer')
      directBuffer = ByteBuffer.allocateDirect(readSize)
      plus.android.importClass(directBuffer)
    }
    if (chosen.chunk && chosen.chunk.length) {
      chunks.push(chosen.chunk)
      captured += chosen.chunk.length
    }
    startedAt = Date.now()
    onStart()
    function pump() {
      timer = null
      if (stopped || !recorder) {
        return
      }
      let chunk = null
      try {
        chunk = pullChunk()
      } catch (error) {
        if (!chunks.length) {
          failEmpty()
          return
        }
        finish(false)
        return
      }
      if (chunk && chunk.length) {
        chunks.push(chunk)
        captured += chunk.length
      }
      if (captured >= sampleRate * channels * 2 * 60) {
        finish(false)
        return
      }
      if (!stopped) {
        timer = setTimeout(pump, chunk && chunk.length ? 0 : 30)
      }
    }
    timer = setTimeout(pump, 0)
  } catch (error) {
    failEmpty()
    return { stop: function() {} }
  }

  function finish(discard) {
    if (stopped) {
      return
    }
    stopped = true
    androidCaptureBusy = false
    clearTimer()
    releaseRecorder(recorder)
    recorder = null
    const duration = startedAt ? Date.now() - startedAt : 0
    if (discard) {
      onStop({ tempFilePath: '', duration: duration })
      return
    }
    const pcm = toMono16k(concatChunks(chunks), sampleRate, channels)
    const heard = pcm && pcm.length ? Math.round(pcm.length / 32) : 0
    if (!pcm.length || peakAmplitude(pcm) < 80) {
      onStop({ tempFilePath: '', duration: heard, silent: true })
      return
    }
    writeBytes(new Uint8Array(buildWav(pcm))).then(function(path) {
      onStop({ tempFilePath: path, duration: heard })
    }).catch(function() {
      onError({ errMsg: FORMAT_ERROR })
    })
  }

  return {
    stop: function(discard) {
      finish(!!discard)
    }
  }
}

function directAndroidMinBufferSize() {
  const AudioRecord = plus.android.importClass('android.media.AudioRecord')
  const size = Number(AudioRecord.getMinBufferSize(16000, 16, 2))
  return size > 0 ? size : 0
}

function releaseRecorder(recorder) {
  if (!recorder) {
    return
  }
  try {
    recorder.stop()
  } catch (error) {
    /* already stopped */
  }
  try {
    recorder.release()
  } catch (error) {
    /* already released */
  }
}

function androidProfiles() {
  return [
    { source: 1, rate: 44100, channel: 16, label: '44100/单声道/MIC' },
    { source: 6, rate: 16000, channel: 16, label: '16000/单声道/识别' },
    { source: 1, rate: 44100, channel: 12, label: '44100/立体声/MIC' },
    { source: 7, rate: 16000, channel: 16, label: '16000/单声道/通话' },
    { source: 5, rate: 44100, channel: 16, label: '44100/单声道/摄像' },
    { source: 1, rate: 16000, channel: 16, label: '16000/单声道/MIC' }
  ]
}

function orderedAndroidProfiles() {
  const profiles = androidProfiles()
  if (!cachedAndroidLabel) {
    return profiles
  }
  const first = []
  const rest = []
  profiles.forEach(function(profile) {
    if (profile.label === cachedAndroidLabel) {
      first.push(profile)
    } else {
      rest.push(profile)
    }
  })
  return first.concat(rest)
}

function openAndroidRecorder(profile) {
  let recorder = null
  try {
    const AudioRecord = plus.android.importClass('android.media.AudioRecord')
    const min = Number(AudioRecord.getMinBufferSize(profile.rate, profile.channel, 2))
    if (!(min > 0)) {
      return null
    }
    const readSize = Math.max(min, 1280)
    const capacity = Math.max(min * 4, readSize * 2)
    recorder = plus.android.newObject('android.media.AudioRecord', profile.source, profile.rate, profile.channel, 2, capacity)
    plus.android.importClass(recorder)
    if (Number(recorder.getState()) !== 1) {
      releaseRecorder(recorder)
      return null
    }
    recorder.startRecording()
    if (Number(recorder.getRecordingState()) !== 3) {
      releaseRecorder(recorder)
      return null
    }
    return {
      recorder: recorder,
      readSize: readSize,
      sampleRate: profile.rate,
      channels: profile.channel === 12 ? 2 : 1,
      label: profile.label
    }
  } catch (error) {
    releaseRecorder(recorder)
    return null
  }
}

function measureAndroidProfile(profile) {
  const opened = openAndroidRecorder(profile)
  if (!opened) {
    return 'AudioRecord ' + profile.label + ' 打不开'
  }
  try {
    const plain = safeRead(opened.recorder, opened.readSize, false)
    const bulk = readBulkOnce(opened.recorder, opened.readSize)
    const bulkPeak = bulk ? peakAmplitude(bulk) : 0
    const shorts = bulkPeak > 0 ? null : safeRead(opened.recorder, opened.readSize, true)
    return 'AudioRecord ' + profile.label
      + ' byte=' + (plain ? plain.length : 0) + ' 峰值=' + (plain ? peakAmplitude(plain) : 0)
      + ' 整段=' + (bulk ? bulk.length : 0) + ' 整段峰值=' + bulkPeak
      + ' 逐样本峰值=' + (shorts ? peakAmplitude(shorts) : '未测')
  } finally {
    releaseRecorder(opened.recorder)
  }
}

function chooseLiveCapture() {
  if (androidCaptureRoute !== 'bulk' || !cachedAndroidLabel) {
    return null
  }
  let profile = null
  androidProfiles().forEach(function(item) {
    if (item.label === cachedAndroidLabel) {
      profile = item
    }
  })
  if (!profile) {
    return null
  }
  const opened = openAndroidRecorder(profile)
  if (!opened) {
    return null
  }
  let chunk = null
  try {
    chunk = readBulkOnce(opened.recorder, opened.readSize)
  } catch (error) {
    chunk = null
  }
  return {
    recorder: opened.recorder,
    readSize: opened.readSize,
    sampleRate: opened.sampleRate,
    channels: opened.channels,
    useDirect: true,
    chunk: chunk,
    label: opened.label
  }
}

function micAlreadyGranted() {
  try {
    const main = plus.android.runtimeMainActivity()
    plus.android.importClass(main)
    return Number(main.checkSelfPermission('android.permission.RECORD_AUDIO')) === 0
  } catch (error) {
    return false
  }
}

function safeRead(recorder, readSize, direct) {
  try {
    return direct ? readDirectOnce(recorder, readSize) : readPlain(recorder, readSize)
  } catch (error) {
    return null
  }
}

function readPlain(recorder, readSize) {
  const buffer = newByteArray(readSize)
  const count = Number(plus.android.invoke(recorder, 'read', buffer, 0, readSize))
  if (!(count > 0)) {
    return null
  }
  return pcmChunk(buffer, count)
}

function readBulkOnce(recorder, readSize) {
  try {
    const ByteBuffer = plus.android.importClass('java.nio.ByteBuffer')
    const direct = ByteBuffer.allocateDirect(readSize)
    plus.android.importClass(direct)
    const count = Number(plus.android.invoke(recorder, 'read', direct, readSize))
    if (!(count > 0)) {
      return null
    }
    const even = count - (count % 2)
    direct.position(0)
    direct.limit(even)
    return heapCopy(direct, even)
  } catch (error) {
    return null
  }
}

function littleEndianOrder() {
  const ByteOrder = plus.android.importClass('java.nio.ByteOrder')
  if (ByteOrder && ByteOrder.LITTLE_ENDIAN) {
    return ByteOrder.LITTLE_ENDIAN
  }
  return plus.android.getAttribute(ByteOrder, 'LITTLE_ENDIAN')
}

function heapCopy(buffer, even) {
  if (!(even > 0)) {
    return null
  }
  const ByteBuffer = plus.android.importClass('java.nio.ByteBuffer')
  const heap = ByteBuffer.allocate(even)
  plus.android.importClass(heap)
  try {
    const order = littleEndianOrder()
    if (order) {
      plus.android.invoke(buffer, 'order', order)
      plus.android.invoke(heap, 'order', order)
    }
  } catch (error) {
    /* raw copy does not depend on byte order */
  }
  plus.android.invoke(heap, 'put', buffer)
  const array = plus.android.invoke(heap, 'array')
  if (!array) {
    return null
  }
  return pcmChunk(array, even)
}

function readDirectOnce(recorder, readSize) {
  const ByteBuffer = plus.android.importClass('java.nio.ByteBuffer')
  const direct = ByteBuffer.allocateDirect(readSize)
  plus.android.importClass(direct)
  const count = Number(plus.android.invoke(recorder, 'read', direct, readSize))
  if (!(count > 0)) {
    return null
  }
  direct.position(0)
  direct.limit(count - (count % 2))
  return readShorts(direct, count)
}

function byteBufferSelfCheck() {
  try {
    const ByteBuffer = plus.android.importClass('java.nio.ByteBuffer')
    const buffer = ByteBuffer.allocate(2)
    plus.android.importClass(buffer)
    plus.android.invoke(buffer, 'putShort', 0x1234)
    plus.android.invoke(buffer, 'flip')
    const value = nextShort(buffer)
    if (value === 0x1234) {
      return 'ByteBuffer自检=通过 读回=' + value
    }
    return 'ByteBuffer自检=失败 读回=' + value
  } catch (error) {
    return 'ByteBuffer自检=失败'
  }
}

function nextShort(buffer) {
  const value = Number(plus.android.invoke(buffer, 'getShort'))
  if (value !== value) {
    return 0
  }
  if (value > 32767) {
    return value - 65536
  }
  return value
}

function readShorts(buffer, count) {
  const samples = count - (count % 2)
  if (!(samples > 0)) {
    return null
  }
  plus.android.importClass(buffer)
  try {
    const ByteOrder = plus.android.importClass('java.nio.ByteOrder')
    plus.android.invoke(buffer, 'order', ByteOrder.LITTLE_ENDIAN)
  } catch (error) {
    /* samples stay in the buffer's existing byte order */
  }
  const bytes = new Uint8Array(samples)
  const total = samples / 2
  for (let index = 0; index < total; index += 1) {
    let sample = nextShort(buffer)
    if (sample < 0) {
      sample += 65536
    }
    bytes[index * 2] = sample & 0xff
    bytes[index * 2 + 1] = (sample >> 8) & 0xff
  }
  return bytes
}

function newByteArray(length) {
  const Byte = plus.android.importClass('java.lang.Byte')
  return plus.android.invoke('java.lang.reflect.Array', 'newInstance', Byte.TYPE, length)
}

function pcmChunk(buffer, count) {
  const text = encodePcmBase64(buffer, count)
  const binary = uni.base64ToArrayBuffer(String(text))
  const bytes = new Uint8Array(binary)
  if (count > 0 && count < bytes.length) {
    return bytes.subarray(0, count)
  }
  return bytes
}

function encodePcmBase64(buffer, count) {
  const Base64 = plus.android.importClass('android.util.Base64')
  let text = ''
  try {
    text = Base64.encodeToString(buffer, 0, count, 2)
  } catch (error) {
    text = ''
  }
  if (!text) {
    text = Base64.encodeToString(buffer, 2)
  }
  if (!text) {
    throw new Error('base64 empty')
  }
  return text
}

function concatChunks(chunks) {
  let total = 0
  chunks.forEach(function(chunk) {
    total += chunk.length
  })
  const all = new Uint8Array(total)
  let offset = 0
  chunks.forEach(function(chunk) {
    all.set(chunk, offset)
    offset += chunk.length
  })
  return all
}

function peakAmplitude(pcm) {
  let peak = 0
  const length = pcm.length - (pcm.length % 2)
  for (let index = 0; index < length; index += 2) {
    let sample = pcm[index] | (pcm[index + 1] << 8)
    if (sample & 0x8000) {
      sample -= 0x10000
    }
    const abs = sample < 0 ? -sample : sample
    if (abs > peak) {
      peak = abs
    }
  }
  return peak
}

function androidMicPermission() {
  return new Promise(function(resolve) {
    let already = false
    try {
      const main = plus.android.runtimeMainActivity()
      plus.android.importClass(main)
      already = Number(main.checkSelfPermission('android.permission.RECORD_AUDIO')) === 0
    } catch (error) {
      already = false
    }
    if (already) {
      resolve('granted')
      return
    }
    plus.android.requestPermissions(['android.permission.RECORD_AUDIO'], function(result) {
      const granted = result && result.granted ? result.granted : []
      let allowed = false
      for (let index = 0; index < granted.length; index += 1) {
        if (granted[index] === 'android.permission.RECORD_AUDIO') {
          allowed = true
        }
      }
      resolve(allowed ? 'just-granted' : 'denied')
    }, function() {
      resolve('denied')
    })
  })
}

function iosMicPermission() {
  return new Promise(function(resolve) {
    let session = null
    try {
      session = plus.ios.invoke('AVAudioSession', 'sharedInstance')
      const status = Number(plus.ios.invoke(session, 'recordPermission'))
      if (status === IOS_GRANTED) {
        plus.ios.deleteObject(session)
        resolve('granted')
        return
      }
      if (status === IOS_DENIED) {
        plus.ios.deleteObject(session)
        resolve('denied')
        return
      }
      plus.ios.invoke(session, 'requestRecordPermission:', function(granted) {
        plus.ios.deleteObject(session)
        resolve(granted ? 'just-granted' : 'denied')
      })
    } catch (error) {
      if (session) {
        try {
          plus.ios.deleteObject(session)
        } catch (ignore) {
          /* session already released */
        }
      }
      resolve('granted')
    }
  })
}

function h5MicPermission() {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return Promise.resolve('granted')
  }
  if (h5Known) {
    return Promise.resolve('granted')
  }
  return navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
    const tracks = stream && stream.getTracks ? stream.getTracks() : []
    tracks.forEach(function(track) {
      track.stop()
    })
    h5Known = true
    return 'just-granted'
  }).catch(function() {
    return 'denied'
  })
}

function fileSystem() {
  if (typeof uni === 'undefined' || !uni.getFileSystemManager) {
    return null
  }
  try {
    const fs = uni.getFileSystemManager()
    if (fs && fs.readFile && fs.writeFile) {
      return fs
    }
  } catch (error) {
    return null
  }
  return null
}

function readFileBuffer(filePath) {
  const fs = fileSystem()
  if (fs) {
    return new Promise(function(resolve, reject) {
      fs.readFile({
        filePath: filePath,
        success: function(res) {
          resolve(res && res.data)
        },
        fail: function(error) {
          reject(error || new Error('read failed'))
        }
      })
    })
  }
  return readFilePlus(filePath).catch(function() {
    return readFileAndroid(filePath)
  })
}

export function readLocalBytes(filePath) {
  return readFileBuffer(filePath).then(function(data) {
    return bytesOf(data)
  })
}

function writeBytes(bytes) {
  const fs = fileSystem()
  if (!fs) {
    return Promise.resolve().then(function() {
      return writeFileAndroid(bytes)
    })
  }
  return new Promise(function(resolve, reject) {
    const filePath = wavOutputPath()
    fs.writeFile({
      filePath: filePath,
      data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      success: function() {
        resolve(filePath)
      },
      fail: function(error) {
        reject(error || new Error('write failed'))
      }
    })
  })
}

function nativePath(filePath) {
  let path = String(filePath || '')
  if (path.indexOf('file://') === 0) {
    path = decodeURI(path.slice(7))
  }
  if (path.charAt(0) === '/') {
    return path
  }
  if (typeof plus !== 'undefined' && plus.io && plus.io.convertLocalFileSystemURL) {
    const converted = plus.io.convertLocalFileSystemURL(path)
    if (converted) {
      path = String(converted)
      if (path.indexOf('file://') === 0) {
        path = decodeURI(path.slice(7))
      }
    }
  }
  return path
}

function plusFileUrl(filePath) {
  let path = String(filePath || '')
  if (path.indexOf('file://') === 0) {
    return path
  }
  if (path.charAt(0) !== '/' && typeof plus !== 'undefined' && plus.io && plus.io.convertLocalFileSystemURL) {
    const converted = plus.io.convertLocalFileSystemURL(path)
    if (converted) {
      path = String(converted)
    }
  }
  if (path.indexOf('file://') === 0) {
    return path
  }
  if (path.charAt(0) === '/') {
    return 'file://' + path
  }
  return path
}

function readFilePlus(filePath) {
  return new Promise(function(resolve, reject) {
    if (typeof plus === 'undefined' || !plus.io || !plus.io.resolveLocalFileSystemURL || !plus.io.FileReader) {
      reject(new Error('no plus io'))
      return
    }
    plus.io.resolveLocalFileSystemURL(plusFileUrl(filePath), function(entry) {
      entry.file(function(file) {
        const reader = new plus.io.FileReader()
        reader.onloadend = function(event) {
          try {
            const result = String((event && event.target && event.target.result) || '')
            const marker = 'base64,'
            const index = result.indexOf(marker)
            if (index < 0) {
              reject(new Error('no base64'))
              return
            }
            resolve(new Uint8Array(uni.base64ToArrayBuffer(result.slice(index + marker.length))))
          } catch (error) {
            reject(error)
          }
        }
        reader.onerror = function() {
          reject(new Error('read error'))
        }
        reader.readAsDataURL(file)
      }, function() {
        reject(new Error('entry file'))
      })
    }, function() {
      reject(new Error('resolve'))
    })
  })
}

function readFileAndroid(filePath) {
  const path = nativePath(filePath)
  const stream = plus.android.newObject('java.io.FileInputStream', path)
  plus.android.importClass(stream)
  const length = Number(stream.available())
  if (!(length > 0)) {
    stream.close()
    throw new Error('read empty')
  }
  const Byte = plus.android.importClass('java.lang.Byte')
  const buffer = plus.android.invoke('java.lang.reflect.Array', 'newInstance', Byte.TYPE, length)
  const count = Number(plus.android.invoke(stream, 'read', buffer, 0, length))
  stream.close()
  if (!(count > 0)) {
    throw new Error('read empty')
  }
  const text = encodePcmBase64(buffer, count)
  const bytes = new Uint8Array(uni.base64ToArrayBuffer(String(text)))
  if (isBlankAudio(bytes)) {
    throw new Error('read blank')
  }
  return bytes
}

function isBlankAudio(bytes) {
  if (!bytes || !bytes.length) {
    return true
  }
  const points = [0, 8, 16, 32, Math.floor(bytes.length / 2), bytes.length - 1]
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    if (point >= 0 && point < bytes.length && bytes[point] !== 0) {
      return false
    }
  }
  return true
}

function writeFileAndroid(bytes) {
  const path = nativePath(wavOutputPath())
  const file = plus.android.newObject('java.io.File', path)
  plus.android.importClass(file)
  const parent = file.getParentFile()
  if (parent) {
    plus.android.importClass(parent)
    if (!parent.exists()) {
      parent.mkdirs()
    }
  }
  const text = uni.arrayBufferToBase64(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
  const Base64 = plus.android.importClass('android.util.Base64')
  const javaBytes = Base64.decode(String(text), 0)
  const stream = plus.android.newObject('java.io.FileOutputStream', file)
  plus.android.importClass(stream)
  try {
    plus.android.invoke(stream, 'write', javaBytes, 0, bytes.byteLength)
  } catch (error) {
    stream.write(javaBytes)
  }
  try {
    stream.flush()
  } catch (error) {
    /* stream has no pending bytes */
  }
  stream.close()
  return path
}

function wavOutputPath() {
  const root = uni.env && uni.env.USER_DATA_PATH ? String(uni.env.USER_DATA_PATH) : '_doc'
  return root.replace(/\/$/, '') + '/speech-' + Date.now() + '.wav'
}

function bytesOf(data) {
  if (!data) {
    return new Uint8Array(0)
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data)
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  }
  return new Uint8Array(0)
}

function isWave(bytes) {
  return bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45
}

function isAmr(bytes) {
  return bytes.length >= 5
    && bytes[0] === 0x23 && bytes[1] === 0x21 && bytes[2] === 0x41 && bytes[3] === 0x4d && bytes[4] === 0x52
}

function isRejectedAudio(bytes) {
  return isAmr(bytes) || isMp3(bytes) || isMp4(bytes) || isOgg(bytes) || isWebm(bytes)
}

function isMp3(bytes) {
  return bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33
}

function isMp4(bytes) {
  return bytes.length >= 8
    && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70
}

function isOgg(bytes) {
  return bytes.length >= 4
    && bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53
}

function isWebm(bytes) {
  return bytes.length >= 4
    && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3
}

function isWavName(filePath) {
  return String(filePath || '').split('?')[0].toLowerCase().endsWith('.wav')
}

function amrFileToWav(filePath, bytes) {
  let pcm = null
  try {
    pcm = decodeAmrToPcm(filePath, bytes)
  } catch (error) {
    pcm = null
  }
  if (!pcm || !pcm.length || peakAmplitude(pcm) < 20) {
    return { error: FORMAT_ERROR }
  }
  if (pcm.length < 25600) {
    return { error: SHORT_ERROR }
  }
  return writeBytes(new Uint8Array(buildWav(pcm))).then(function(path) {
    return { filePath: path }
  })
}

function amrInfo(bytes) {
  if (bytes.length >= 9 && bytes[0] === 0x23 && bytes[5] === 0x2d) {
    return {
      wide: true,
      header: 9,
      mime: 'audio/amrwb',
      rate: 16000,
      sizes: [18, 24, 33, 37, 41, 47, 51, 59, 61, 6, 0, 0, 0, 0, 1, 1]
    }
  }
  if (bytes.length >= 6 && bytes[0] === 0x23 && bytes[1] === 0x21) {
    return {
      wide: false,
      header: 6,
      mime: 'audio/3gpp',
      rate: 8000,
      sizes: [13, 14, 16, 18, 20, 21, 27, 32, 6, 0, 0, 0, 0, 0, 1, 1]
    }
  }
  return null
}

function decodeAmrToPcm(filePath, bytes) {
  const info = amrInfo(bytes)
  if (!info) {
    throw new Error('not amr')
  }
  let decoded = decodeWithExtractor(nativePath(filePath))
  if (!decoded || !decoded.pcm || !decoded.pcm.length) {
    try {
      const temp = writeRawFile(bytes, info.wide ? '.awb' : '.amr')
      decoded = decodeWithExtractor(temp)
    } catch (error) {
      decoded = null
    }
  }
  if (!decoded || !decoded.pcm || !decoded.pcm.length) {
    decoded = {
      pcm: decodeAmrFrames(bytes, info),
      rate: info.rate,
      channels: 1
    }
  }
  if (!decoded.pcm || !decoded.pcm.length) {
    throw new Error('decode empty')
  }
  return toMono16k(decoded.pcm, decoded.rate || info.rate, decoded.channels || 1)
}

function decodeWithExtractor(path) {
  if (!path) {
    return null
  }
  let extractor = null
  let codec = null
  try {
    extractor = plus.android.newObject('android.media.MediaExtractor')
    plus.android.importClass(extractor)
    extractor.setDataSource(path)
    const tracks = Number(extractor.getTrackCount())
    let format = null
    let mime = ''
    for (let index = 0; index < tracks; index += 1) {
      const candidate = extractor.getTrackFormat(index)
      plus.android.importClass(candidate)
      const candidateMime = String(candidate.getString('mime') || '')
      if (candidateMime.indexOf('audio/') === 0) {
        extractor.selectTrack(index)
        format = candidate
        mime = candidateMime
        break
      }
    }
    if (!format || !mime) {
      return null
    }
    const MediaCodec = plus.android.importClass('android.media.MediaCodec')
    codec = MediaCodec.createDecoderByType(mime)
    plus.android.importClass(codec)
    plus.android.invoke(codec, 'configure', format, null, null, 0)
    codec.start()
    return pumpExtractor(extractor, codec, mime.indexOf('amrwb') >= 0 ? 16000 : 8000)
  } catch (error) {
    return null
  } finally {
    releaseCodec(codec)
    if (extractor) {
      try {
        extractor.release()
      } catch (error) {
        /* already released */
      }
    }
  }
}

function pumpExtractor(extractor, codec, fallbackRate) {
  const parts = []
  const state = { rate: fallbackRate, channels: 1, done: false }
  let inputDone = false
  let stalls = 0
  for (let turn = 0; turn < 4000 && !state.done; turn += 1) {
    let progressed = false
    if (!inputDone) {
      const inIndex = Number(codec.dequeueInputBuffer(inputDone ? 0 : 40))
      if (inIndex >= 0) {
        progressed = true
        const input = codec.getInputBuffer(inIndex)
        plus.android.importClass(input)
        input.clear()
        const sampleSize = Number(extractor.readSampleData(input, 0))
        if (!(sampleSize >= 0)) {
          codec.queueInputBuffer(inIndex, 0, 0, 0, 4)
          inputDone = true
        } else {
          codec.queueInputBuffer(inIndex, 0, sampleSize, Number(extractor.getSampleTime()), 0)
          extractor.advance()
        }
      }
    }
    const before = parts.length
    drainDecoder(codec, parts, state, inputDone)
    if (parts.length > before) {
      progressed = true
    }
    if (!progressed) {
      stalls += 1
      if (stalls > (inputDone ? 40 : 25)) {
        break
      }
    } else {
      stalls = 0
    }
    if (inputDone && state.done) {
      break
    }
  }
  return {
    pcm: concatChunks(parts),
    rate: state.rate,
    channels: state.channels
  }
}

function dequeueInput(codec, rounds) {
  let index = -1
  const tries = rounds > 0 ? rounds : 1
  for (let wait = 0; wait < tries && index < 0; wait += 1) {
    index = Number(codec.dequeueInputBuffer(40))
  }
  return index
}

function decodeAmrFrames(bytes, info) {
  const MediaCodec = plus.android.importClass('android.media.MediaCodec')
  const MediaFormat = plus.android.importClass('android.media.MediaFormat')
  const codec = MediaCodec.createDecoderByType(info.mime)
  plus.android.importClass(codec)
  const format = MediaFormat.createAudioFormat(info.mime, info.rate, 1)
  plus.android.invoke(codec, 'configure', format, null, null, 0)
  codec.start()
  try {
    const parts = []
    const state = { rate: info.rate, channels: 1, done: false }
    let offset = info.header
    let frameIndex = 0
    while (offset < bytes.length && frameIndex < 4000 && !state.done) {
      const size = amrFrameSize(bytes, offset, info.sizes)
      if (!(size > 0)) {
        break
      }
      const frame = bytes.subarray(offset, offset + size)
      offset += size
      const inIndex = dequeueInput(codec, 25)
      if (!(inIndex >= 0)) {
        break
      }
      const input = codec.getInputBuffer(inIndex)
      plus.android.importClass(input)
      input.clear()
      plus.android.invoke(input, 'put', javaBytesFrom(frame))
      codec.queueInputBuffer(inIndex, 0, frame.length, frameIndex * 20000, 0)
      frameIndex += 1
      drainDecoder(codec, parts, state, false)
    }
    const endIndex = dequeueInput(codec, 25)
    if (endIndex >= 0) {
      codec.queueInputBuffer(endIndex, 0, 0, frameIndex * 20000, 4)
    }
    for (let turn = 0; turn < 40 && !state.done; turn += 1) {
      drainDecoder(codec, parts, state, true)
    }
    return concatChunks(parts)
  } finally {
    releaseCodec(codec)
  }
}

function amrFrameSize(bytes, offset, sizes) {
  if (offset >= bytes.length) {
    return 0
  }
  const mode = (bytes[offset] >> 3) & 0x0f
  const size = sizes[mode] || 0
  if (!(size > 0) || offset + size > bytes.length) {
    return 0
  }
  return size
}

function drainDecoder(codec, parts, state, blocking) {
  const info = plus.android.newObject('android.media.MediaCodec$BufferInfo')
  plus.android.importClass(info)
  const limit = blocking ? 20 : 4
  for (let turn = 0; turn < limit && !state.done; turn += 1) {
    const outIndex = Number(codec.dequeueOutputBuffer(info, blocking ? 40 : 0))
    if (outIndex === -1) {
      return
    }
    if (outIndex === -3) {
      continue
    }
    if (outIndex === -2) {
      try {
        const format = codec.getOutputFormat()
        plus.android.importClass(format)
        const rate = Number(format.getInteger('sample-rate'))
        const channelCount = Number(format.getInteger('channel-count'))
        if (rate > 0) {
          state.rate = rate
        }
        if (channelCount > 0) {
          state.channels = channelCount
        }
      } catch (error) {
        /* keep the fallback rate */
      }
      continue
    }
    if (!(outIndex >= 0)) {
      return
    }
    const size = javaField(info, 'size')
    const byteOffset = javaField(info, 'offset')
    const flags = javaField(info, 'flags')
    if (size > 0) {
      const output = codec.getOutputBuffer(outIndex)
      plus.android.importClass(output)
      const even = size - (size % 2)
      output.position(byteOffset)
      output.limit(byteOffset + even)
      let chunk = null
      try {
        chunk = heapCopy(output, even)
      } catch (error) {
        chunk = null
      }
      if (!chunk || !chunk.length || peakAmplitude(chunk) === 0) {
        output.position(byteOffset)
        output.limit(byteOffset + even)
        chunk = readShorts(output, even)
      }
      if (chunk && chunk.length) {
        parts.push(chunk)
      }
    }
    codec.releaseOutputBuffer(outIndex, false)
    if (flags & 4) {
      state.done = true
      return
    }
  }
}

function javaField(obj, name) {
  try {
    const value = plus.android.getAttribute(obj, name)
    if (value != null && value !== '') {
      return Number(value)
    }
  } catch (error) {
    /* try the property */
  }
  try {
    return Number(obj[name])
  } catch (error) {
    return 0
  }
}

function javaBytesFrom(bytes) {
  const text = uni.arrayBufferToBase64(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
  const Base64 = plus.android.importClass('android.util.Base64')
  return Base64.decode(String(text), 0)
}

function releaseCodec(codec) {
  if (!codec) {
    return
  }
  try {
    codec.stop()
  } catch (error) {
    /* not started */
  }
  try {
    codec.release()
  } catch (error) {
    /* already released */
  }
}

function writeRawFile(bytes, suffix) {
  const path = nativePath(rawOutputPath(suffix))
  const file = plus.android.newObject('java.io.File', path)
  plus.android.importClass(file)
  const parent = file.getParentFile()
  if (parent) {
    plus.android.importClass(parent)
    if (!parent.exists()) {
      parent.mkdirs()
    }
  }
  const javaBytes = javaBytesFrom(bytes)
  const stream = plus.android.newObject('java.io.FileOutputStream', file)
  plus.android.importClass(stream)
  try {
    plus.android.invoke(stream, 'write', javaBytes, 0, bytes.byteLength)
  } catch (error) {
    stream.write(javaBytes)
  }
  try {
    stream.flush()
  } catch (error) {
    /* nothing pending */
  }
  stream.close()
  return path
}

function rawOutputPath(suffix) {
  const root = uni.env && uni.env.USER_DATA_PATH ? String(uni.env.USER_DATA_PATH) : '_doc'
  return root.replace(/\/$/, '') + '/speech-' + Date.now() + suffix
}

function toMono16k(pcm, sampleRate, channels) {
  if (!pcm || !pcm.length) {
    return new Uint8Array(0)
  }
  const rate = Number(sampleRate) > 0 ? Number(sampleRate) : 16000
  const channelCount = Number(channels) === 2 ? 2 : 1
  if (rate === 16000 && channelCount === 1) {
    return pcm
  }
  const frames = Math.floor(pcm.length / 2 / channelCount)
  const mono = new Int16Array(frames)
  for (let index = 0; index < frames; index += 1) {
    if (channelCount === 2) {
      const left = readSample(pcm, index * 4)
      const right = readSample(pcm, index * 4 + 2)
      mono[index] = (left + right) / 2
    } else {
      mono[index] = readSample(pcm, index * 2)
    }
  }
  const outCount = Math.max(0, Math.floor(mono.length * 16000 / rate))
  const out = new Int16Array(outCount)
  const step = rate / 16000
  for (let index = 0; index < outCount; index += 1) {
    const pos = index * step
    const base = Math.floor(pos)
    const next = Math.min(base + 1, mono.length - 1)
    const frac = pos - base
    out[index] = mono[base] + (mono[next] - mono[base]) * frac
  }
  const packed = new Uint8Array(out.length * 2)
  for (let index = 0; index < out.length; index += 1) {
    const sample = out[index]
    packed[index * 2] = sample & 0xff
    packed[index * 2 + 1] = (sample >> 8) & 0xff
  }
  return packed
}

function readSample(pcm, offset) {
  let sample = pcm[offset] | (pcm[offset + 1] << 8)
  if (sample & 0x8000) {
    sample -= 0x10000
  }
  return sample
}

function buildWav(pcm) {
  const length = pcm.byteLength - (pcm.byteLength % 2)
  const buffer = new ArrayBuffer(44 + length)
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + length, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 16000, true)
  view.setUint32(28, 32000, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, length, true)
  bytes.set(pcm.subarray(0, length), 44)
  return buffer
}

function writeAscii(view, offset, text) {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index))
  }
}
