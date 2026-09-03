import { createClient } from '@supabase/supabase-js'
import { legalSignupMetadata } from './legalDocuments'
import { hasSignupLegalConsent } from './legalSignupState'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Missing Supabase environment variables. Copy .env.example to .env.local and add your project values.')
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey)

// The sign-up UI uses a native required checkbox for the current Terms, Privacy,
// and Community versions. When that explicit consent is present, attach only the
// accepted version strings to Supabase signup metadata. The database trigger
// validates them against its own current-policy table and supplies the trusted
// server timestamp; the client does not get to choose accepted_at.
const originalSignUp = supabase.auth.signUp.bind(supabase.auth)
type SignUpInput = Parameters<typeof originalSignUp>[0]
type SignUpInputWithOptions = SignUpInput & {
  options?: {
    data?: Record<string, unknown>
    [key: string]: unknown
  }
}

supabase.auth.signUp = (async (credentials: SignUpInput) => {
  if (!hasSignupLegalConsent()) return originalSignUp(credentials)

  const current = credentials as SignUpInputWithOptions
  const next = {
    ...credentials,
    options: {
      ...(current.options ?? {}),
      data: {
        ...(current.options?.data ?? {}),
        ...legalSignupMetadata(),
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
