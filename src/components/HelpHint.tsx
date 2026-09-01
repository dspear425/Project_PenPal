import type { HelpContext } from '../lib/helpContent'

type Props = {
  articleId: string
  context?: HelpContext
  label?: string
  className?: string
}

export function announceHelpContext(context: HelpContext) {
  window.dispatchEvent(new CustomEvent('project-penpal:help-context', { detail: { context } }))
}

export function openHelpArticle(articleId: string, context?: HelpContext) {
  window.dispatchEvent(new CustomEvent('project-penpal:open-help', {
    detail: { articleId, context },
  }))
}

export default function HelpHint({ articleId, context, label = 'Help', className = '' }: Props) {
  return (
    <button
      className={`help-hint ${className}`.trim()}
      type="button"
      onClick={() => openHelpArticle(articleId, context)}
      aria-label={`${label}: open Help Center`}
    >
      <span aria-hidden="true">?</span>
      <span>{label}</span>
    </button>
  )
}
