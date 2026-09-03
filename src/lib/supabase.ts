import { createClient } from '@supabase/supabase-js'
import { legalSignupMetadata } from './legalDocuments'
import { hasSignupLegalConsent } from './legalSignupState'
import { getSignupBetaInviteCode } from './betaInviteSignupState'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Missing Supabase environment variables. Copy .env.example to .env.local and add your project values.')
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey)

// Signup is closed-beta gated. The browser performs a friendly preflight so a
// member gets a useful message, but the database auth trigger validates the code
// again under a row lock and is the actual security boundary.
//
// The legal-consent UI uses a native required checkbox for the current Terms,
// Privacy, and Community versions. When that explicit consent is present, attach
// only the accepted version strings. Existing options/data are preserved.
const originalSignUp = supabase.auth.signUp.bind(supabase.auth)
type SignUpInput = Parameters<typeof originalSignUp>[0]
type SignUpInputWithOptions = SignUpInput & {
  options?: {
    data?: Record<string, unknown>
    [key: string]: unknown
  }
}

supabase.auth.signUp = (async (credentials: SignUpInput) => {
  const inviteCode = getSignupBetaInviteCode().trim()
  if (!inviteCode) throw new Error('Enter the beta invitation code you received.')

  const { data: inviteRows, error: inviteError } = await supabase.rpc('check_beta_invite', {
    invite_code: inviteCode,
  })
  if (inviteError) throw inviteError

  const inviteResult = Array.isArray(inviteRows) ? inviteRows[0] : inviteRows
  if (!inviteResult?.valid) {
    throw new Error(inviteResult?.message || 'This invitation is invalid or no longer available.')
  }

  const current = credentials as SignUpInputWithOptions
  const next = {
    ...credentials,
    options: {
      ...(current.options ?? {}),
      data: {
        ...(current.options?.data ?? {}),
        beta_invite_code: inviteCode,
        ...(hasSignupLegalConsent() ? legalSignupMetadata() : {}),
      },
    },
  } as SignUpInput

  return originalSignUp(next)
}) as typeof supabase.auth.signUp

// Do not globally filter Supabase auth events here. Multiple parts of Project
// PenPal subscribe to the same client (the app shell, member UI, legal gate, etc.).
// A shared event filter can deliver a real SIGNED_IN event to the first listener
// and accidentally suppress it for the rest. Each subscriber is responsible for
// ignoring routine refresh/focus events without interfering with other listeners.
