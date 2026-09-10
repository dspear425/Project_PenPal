let captchaToken: string | null = null

export function getAuthCaptchaToken() {
  return captchaToken
}

export function setAuthCaptchaToken(token: string | null) {
  captchaToken = token
}

export function requestAuthCaptchaReset() {
  captchaToken = null
  window.dispatchEvent(new CustomEvent('project-penpal:captcha-reset'))
}
