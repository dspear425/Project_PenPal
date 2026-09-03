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

// Supabase can emit auth events when a browser tab regains focus or a token is
// refreshed. The app's profile loader treats auth notifications as a reason to
// reload saved profile data, so forwarding those routine events would overwrite
// an in-progress onboarding form with the last database values.
//
// Keep true session changes (initial session, a new sign-in, and sign-out), while
// suppressing routine refresh/refocus notifications for the same signed-in user.
const originalOnAuthStateChange = supabase.auth.onAuthStateChange.bind(supabase.auth)
type AuthStateCallback = Parameters<typeof originalOnAuthStateChange>[0]

let activeUserId: string | null = null

supabase.auth.onAuthStateChange = ((callback: AuthStateCallback) =>
  originalOnAuthStateChange((event, session) => {
    const userId = session?.user.id ?? null

    if (event === 'INITIAL_SESSION') {
      activeUserId = userId
      callback(event, session)
      return
    }

    if (event === 'SIGNED_OUT') {
      activeUserId = null
      callback(event, session)
      return
    }

    if (event === 'SIGNED_IN') {
      // A repeated SIGNED_IN for the same user can happen on tab refocus.
      // It is not a real navigation/login event and should not reload the form.
      if (userId && userId === activeUserId) return
      activeUserId = userId
      callback(event, session)
      return
    }

    // TOKEN_REFRESHED and USER_UPDATED do not require reloading profile form data.
    // Suppressing them protects unsaved onboarding/edit-profile changes.
    if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') return

    callback(event, session)
  })) as typeof supabase.auth.onAuthStateChange
