export type MatchProfile = {
  id: string
  display_name: string | null
  birth_year: number | null
  country: string | null
  about_me: string | null
  languages: string[] | null
  friendship_goals: string[] | null
  communication_style: string | null
  correspondence_frequency: string | null
  accepting_new_penpals: boolean | null
  max_penpals: number | null
}

export type CurrentProfile = Omit<MatchProfile, 'id'>

export type MatchResult = {
  profile: MatchProfile
  score: number
  sharedInterestIds: number[]
  reasons: string[]
}

const frequencyOrder = ['several_week', 'weekly', 'biweekly', 'monthly']

function intersection<T>(a: T[] = [], b: T[] = []) {
  const bSet = new Set(b)
  return a.filter((value) => bSet.has(value))
}

function normalizedStrings(values: string[] | null | undefined) {
  return (values ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean)
}

function frequencyScore(a: string | null, b: string | null) {
  if (!a || !b) return 4
  if (a === b) return 15
  if (a === 'flexible' || b === 'flexible') return 12

  const aIndex = frequencyOrder.indexOf(a)
  const bIndex = frequencyOrder.indexOf(b)
  if (aIndex < 0 || bIndex < 0) return 5

  const distance = Math.abs(aIndex - bIndex)
  if (distance === 1) return 10
  if (distance === 2) return 6
  return 2
}

function writingScore(a: string | null, b: string | null) {
  if (!a || !b) return 7
  if (a === b) return 25
  if (a === 'any' || b === 'any') return 20

  const compatiblePairs = new Set([
    'short:medium',
    'medium:short',
    'medium:long',
    'long:medium',
  ])

  return compatiblePairs.has(`${a}:${b}`) ? 14 : 6
}

function locationScore(
  currentCountry: string | null,
  otherCountry: string | null,
  currentGoals: string[],
) {
  if (!currentCountry || !otherCountry) return 2

  const sameCountry = currentCountry.trim().toLowerCase() === otherCountry.trim().toLowerCase()
  if (currentGoals.includes('international') && !sameCountry) return 5
  if (currentGoals.includes('local') && sameCountry) return 5
  return 2
}

export function calculateMatch(
  current: CurrentProfile,
  other: MatchProfile,
  currentInterestIds: number[],
  otherInterestIds: number[],
): MatchResult {
  const sharedInterestIds = intersection(currentInterestIds, otherInterestIds)
  const interestDenominator = Math.max(3, Math.min(6, currentInterestIds.length || 3))
  const interestPoints = Math.min(30, (sharedInterestIds.length / interestDenominator) * 30)

  const currentGoals = current.friendship_goals ?? []
  const otherGoals = other.friendship_goals ?? []
  const sharedGoals = intersection(currentGoals, otherGoals)
  const goalDenominator = Math.max(1, Math.min(currentGoals.length || 1, otherGoals.length || 1))
  const goalPoints = Math.min(20, (sharedGoals.length / goalDenominator) * 20)

  const writePoints = writingScore(current.communication_style, other.communication_style)
  const frequencyPoints = frequencyScore(current.correspondence_frequency, other.correspondence_frequency)
  const locationPoints = locationScore(current.country, other.country, currentGoals)

  const currentLanguages = normalizedStrings(current.languages)
  const otherLanguages = normalizedStrings(other.languages)
  const sharedLanguages = intersection(currentLanguages, otherLanguages)
  const languagePoints = sharedLanguages.length ? 5 : 0

  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(interestPoints + goalPoints + writePoints + frequencyPoints + locationPoints + languagePoints),
    ),
  )

  const reasons: string[] = []
  if (sharedInterestIds.length) {
    reasons.push(`${sharedInterestIds.length} shared interest${sharedInterestIds.length === 1 ? '' : 's'}`)
  }
  if (writePoints >= 20) reasons.push('Very compatible writing style')
  else if (writePoints >= 14) reasons.push('Compatible writing style')
  if (sharedGoals.length) {
    reasons.push(`${sharedGoals.length} shared friendship goal${sharedGoals.length === 1 ? '' : 's'}`)
  }
  if (frequencyPoints >= 12) reasons.push('Similar reply rhythm')
  else if (frequencyPoints >= 10) reasons.push('Compatible reply rhythm')
  if (sharedLanguages.length) reasons.push(`Shared language: ${sharedLanguages[0]}`)

  return { profile: other, score, sharedInterestIds, reasons: reasons.slice(0, 4) }
}
