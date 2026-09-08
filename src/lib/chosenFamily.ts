export const chosenFamilyGoalOptions = [
  ['chosen-family', 'Chosen family', 'I hope to build close, lasting friendships that may grow to feel like family.'],
  ['supportive', 'Supportive friendship', 'I value encouragement, checking in, and showing up consistently for each other.'],
] as const

export const careOptions = [
  ['regular-check-ins', 'Regular check-ins'],
  ['encouragement', 'Encouragement'],
  ['listening', 'A listening ear'],
  ['birthday-holiday-cards', 'Birthday & holiday cards'],
  ['celebrate-milestones', 'Celebrating milestones'],
  ['share-traditions', 'Sharing traditions'],
  ['long-letters', 'Long, thoughtful letters'],
  ['consistent-presence', 'Consistent long-term presence'],
] as const

export const careLabels: Record<string, string> = Object.fromEntries(careOptions)

export const chosenFamilyGoalLabels: Record<string, string> = Object.fromEntries(
  chosenFamilyGoalOptions.map(([value, label]) => [value, label]),
)

export function careOverlap(offered: string[] | null | undefined, appreciated: string[] | null | undefined) {
  const appreciatedSet = new Set(appreciated ?? [])
  return (offered ?? []).filter((value) => appreciatedSet.has(value))
}
