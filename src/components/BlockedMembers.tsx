import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type BlockedMember = {
  blocked_id: string
  display_name: string | null
  country: string | null
  blocked_at: string
}

type Props = {
  onBack: () => void
  onUnblocked: () => void
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return String(error || 'Unknown error')
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

export default function BlockedMembers({ onBack, onUnblocked }: Props) {
  const [members, setMembers] = useState<BlockedMember[]>([])
  const [loading, setLoading] = useState(true)
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    void loadBlocks()
  }, [])

  async function loadBlocks() {
    setLoading(true)
    setMessage('')

    try {
      const { data, error } = await supabase.rpc('list_my_blocks')
      if (error) throw error
      setMembers((data ?? []) as BlockedMember[])
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  async function unblock(member: BlockedMember) {
    const name = member.display_name || 'this member'
    const confirmed = window.confirm(
      `Unblock ${name}? They will not be notified. If you had a previous pen-pal relationship, it may become visible in Past Pen Pals again and either of you may be able to send a new connection request.`,
    )
    if (!confirmed) return

    setWorkingId(member.blocked_id)
    setMessage('')

    try {
      const { error } = await supabase.rpc('unblock_member', { target_user: member.blocked_id })
      if (error) throw error

      setMembers((previous) => previous.filter((item) => item.blocked_id !== member.blocked_id))
      setMessage(`${name} has been unblocked.`)
      onUnblocked()
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setWorkingId(null)
    }
  }

  return (
    <section className="blocked-members-view">
      <button className="back correspondence-back" onClick={onBack}>← Pen pals & requests</button>
      <p className="eyebrow">Safety & privacy</p>
      <h1 className="correspondence-title">Blocked members.</h1>
      <p className="hero-copy correspondence-copy">
        Blocked members cannot contact you or appear in your normal discovery results. Unblocking does not automatically reconnect you.
      </p>

      {message && <p className="status-message correspondence-status">{message}</p>}

      {loading ? (
        <p className="connection-empty">Loading your block list…</p>
      ) : members.length === 0 ? (
        <div className="blocked-empty-state">
          <span aria-hidden="true">✓</span>
          <div>
            <h2>No blocked members.</h2>
            <p>You are not currently blocking anyone.</p>
          </div>
        </div>
      ) : (
        <div className="blocked-member-list">
          {members.map((member) => (
            <article className="connection-item blocked-member-item" key={member.blocked_id}>
              <div>
                <span className="person-kicker">Blocked {formatDate(member.blocked_at)}</span>
                <h3>{member.display_name || 'Member'}{member.country ? ` · ${member.country}` : ''}</h3>
                <p className="request-state">This person cannot find or contact you while blocked.</p>
              </div>
              <button
                className="secondary"
                type="button"
                disabled={workingId === member.blocked_id}
                onClick={() => void unblock(member)}
              >
                {workingId === member.blocked_id ? 'Unblocking…' : 'Unblock'}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
