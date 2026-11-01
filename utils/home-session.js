export const HOME_SESSION_PREFIX = 'digital-home-session'

export function homeSessionKey(userId) {
  if (userId === '' || userId == null) {
    return HOME_SESSION_PREFIX
  }
  return HOME_SESSION_PREFIX + ':' + userId
}

export function readHomeSession(userId) {
  try {
    const scoped = uni.getStorageSync(homeSessionKey(userId))
    if (scoped !== '' && scoped != null) {
      return scoped
    }
    if (userId !== '' && userId != null) {
      const legacy = uni.getStorageSync(HOME_SESSION_PREFIX)
      return legacy === '' || legacy == null ? '' : legacy
    }
    return ''
  } catch (error) {
    return ''
  }
}

export function writeHomeSession(userId, sessionId) {
  uni.setStorageSync(homeSessionKey(userId), sessionId)
  if (homeSessionKey(userId) !== HOME_SESSION_PREFIX) {
    uni.removeStorageSync(HOME_SESSION_PREFIX)
  }
}

export function removeHomeSession(userId) {
  try {
    uni.removeStorageSync(homeSessionKey(userId))
    uni.removeStorageSync(HOME_SESSION_PREFIX)
  } catch (error) {}
}

export function clearHomeSessions() {
  try {
    const info = uni.getStorageInfoSync()
    const keys = (info && info.keys) || []
    keys.forEach(function(key) {
      if (key === HOME_SESSION_PREFIX || String(key).indexOf(HOME_SESSION_PREFIX + ':') === 0) {
        uni.removeStorageSync(key)
      }
    })
  } catch (error) {}
}
