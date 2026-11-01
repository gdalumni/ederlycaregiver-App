const TokenKey = 'App-Token'
const UsernameKey = 'login-username'
const LoginUntilKey = 'login-until'
const REMEMBER_MS = 3 * 24 * 60 * 60 * 1000

export function getToken() {
  return uni.getStorageSync(TokenKey)
}

export function setToken(token) {
  return uni.setStorageSync(TokenKey, token)
}

export function removeToken() {
  uni.removeStorageSync(TokenKey)
  uni.removeStorageSync(LoginUntilKey)
}

export function getRememberedUsername() {
  const value = uni.getStorageSync(UsernameKey)
  return value ? String(value) : ''
}

export function setRememberedUsername(username) {
  const value = username ? String(username).trim() : ''
  if (!value) {
    uni.removeStorageSync(UsernameKey)
    return
  }
  uni.setStorageSync(UsernameKey, value)
}

export function markLoginWindow() {
  uni.setStorageSync(LoginUntilKey, Date.now() + REMEMBER_MS)
}

/** 有凭证且仍在 3 天内返回 true。过期会清掉凭证，不清除已记住的用户名。 */
export function ensureLoginWindow() {
  if (!getToken()) {
    return false
  }
  const until = Number(uni.getStorageSync(LoginUntilKey))
  if (!until) {
    markLoginWindow()
    return true
  }
  if (Date.now() > until) {
    removeToken()
    return false
  }
  return true
}
