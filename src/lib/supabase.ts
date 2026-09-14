import { createClient } from '@supabase/supabase-js'
import { legalSignupMetadata } from './legalDocuments'
import { hasSignupLegalConsent } from './legalSignupState'
import { isTurnstileConfigured } from './turnstile'
import { getAuthCaptchaToken, requestAuthCaptchaReset } from './authBotProtectionState'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Missing Supabase environment variables. Copy .env.example to .env.local and add your project values.')
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey)

function requireCaptchaToken() {
  if (!isTurnstileConfigured()) return null
  const token = getAuthCaptchaToken()
  if (!token) throw new Error('Please complete the human verification before continuing.')
  return token
}

// Public early-access signup is open. The legal-consent UI uses a native
// required checkbox for the current Terms, Privacy, and Community versions.
// When that explicit consent is present, attach only the accepted version strings.
// Existing signup options/data are preserved. When Turnstile is configured, its
// short-lived token is passed to Supabase Auth for server-side CAPTCHA validation.
const originalSignUp = supabase.auth.signUp.bind(supabase.auth)
type SignUpInput = Parameters<typeof originalSignUp>[0]
type SignUpInputWithOptions = SignUpInput & {
  options?: {
    data?: Record<string, unknown>
    captchaToken?: string
    [key: string]: unknown
  }
}

supabase.auth.signUp = (async (credentials: SignUpInput) => {
  const captchaToken = requireCaptchaToken()
  const current = credentials as SignUpInputWithOptions
  const next = {
    ...credentials,
    options: {
      ...(current.options ?? {}),
      ...(captchaToken ? { captchaToken } : {}),
      data: {
        ...(current.options?.data ?? {}),
        ...(hasSignupLegalConsent() ? legalSignupMetadata() : {}),
      },
    },
  } as SignUpInput

  try {
    return await originalSignUp(next)
  } finally {
    if (captchaToken) requestAuthCaptchaReset()
  }
}) as typeof supabase.auth.signUp

// Protect password sign-in with the same challenge when Turnstile is enabled.
const originalSignInWithPassword = supabase.auth.signInWithPassword.bind(supabase.auth)
type SignInInput = Parameters<typeof originalSignInWithPassword>[0]

supabase.auth.signInWithPassword = (async (credentials: SignInInput) => {
  const captchaToken = requireCaptchaToken()
  const next = captchaToken
    ? { ...credentials, options: { ...(credentials.options ?? {}), captchaToken } }
    : credentials

  try {
    return await originalSignInWithPassword(next as SignInInput)
  } finally {
    if (captchaToken) requestAuthCaptchaReset()
  }
}) as typeof supabase.auth.signInWithPassword

// Password-reset email requests are another public auth endpoint that can be
// abused for email flooding, so pass the Turnstile token there as well.
const originalResetPasswordForEmail = supabase.auth.resetPasswordForEmail.bind(supabase.auth)
type ResetOptions = Parameters<typeof originalResetPasswordForEmail>[1]

supabase.auth.resetPasswordForEmail = (async (email: string, options?: ResetOptions) => {
  const captchaToken = requireCaptchaToken()
  const nextOptions = captchaToken
    ? { ...(options ?? {}), captchaToken }
    : options

  try {
    return await originalResetPasswordForEmail(email, nextOptions)
  } finally {
    if (captchaToken) requestAuthCaptchaReset()
  }
}) as typeof supabase.auth.resetPasswordForEmail

// Do not globally filter Supabase auth events here. Multiple parts of Project
// PenPal subscribe to the same client (the app shell, member UI, legal gate, etc.).
// A shared event filter can deliver a real SIGNED_IN event to the first listener
// and accidentally suppress it for the rest. Each subscriber is responsible for
// ignoring routine refresh/focus events without interfering with other listeners.
