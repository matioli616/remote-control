import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import './Terminal.css'

export default function Terminal({ session }) {
  const [entries, setEntries] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [cmdHistory, setCmdHistory] = useState([])
  const [histIdx, setHistIdx] = useState(-1)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    supabase
      .from('rc_commands')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('type', 'shell')
      .order('created_at', { ascending: true })
      .limit(50)
      .then(({ data }) => { if (data) setEntries(data) })
  }, [session])

  useEffect(() => {
    const channel = supabase
      .channel('rc-terminal')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'rc_commands',
        filter: `user_id=eq.${session.user.id}`
      }, (payload) => {
        if (payload.eventType === 'INSERT' && payload.new.type === 'shell') {
          setEntries(prev => [...prev, payload.new])
        } else if (payload.eventType === 'UPDATE') {
          setEntries(prev => prev.map(e => e.id === payload.new.id ? payload.new : e))
          if (payload.new.status === 'done' || payload.new.status === 'error') {
            setBusy(false)
          }
        }
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [session])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries])

  async function run(e) {
    e.preventDefault()
    if (!input.trim() || busy) return
    const cmd = input.trim()
    setInput('')
    setHistIdx(-1)
    setCmdHistory(prev => [cmd, ...prev.slice(0, 49)])
    setBusy(true)

    await supabase.from('rc_commands').insert({
      user_id: session.user.id,
      type: 'shell',
      payload: { command: cmd },
      status: 'pending'
    })
  }

  function handleKey(e) {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const i = Math.min(histIdx + 1, cmdHistory.length - 1)
      setHistIdx(i)
      if (cmdHistory[i] !== undefined) setInput(cmdHistory[i])
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const i = Math.max(histIdx - 1, -1)
      setHistIdx(i)
      setInput(i === -1 ? '' : cmdHistory[i])
    }
  }

  function clear() { setEntries([]) }

  function statusIcon(s) {
    if (s === 'pending') return <span className="spin">◌</span>
    if (s === 'running') return <span className="pulse">⚡</span>
    if (s === 'done') return <span className="ok">✓</span>
    if (s === 'error') return <span className="err">✗</span>
    return null
  }

  return (
    <div className="terminal" onClick={() => inputRef.current?.focus()}>
      <div className="term-bar">
        <span>PowerShell · Windows Remote</span>
        <button onClick={clear}>Limpar</button>
      </div>

      <div className="term-body">
        {entries.length === 0 && (
          <div className="term-empty">
            Aguardando comandos. O agente precisa estar rodando no PC.
          </div>
        )}
        {entries.map(entry => (
          <div key={entry.id} className="term-entry">
            <div className="term-line">
              <span className="ps-prompt">PS &gt;</span>
              <span className="term-cmd-text">{entry.payload.command}</span>
              <span className="term-icon">{statusIcon(entry.status)}</span>
            </div>
            {entry.output && (
              <pre className="term-out">{entry.output}</pre>
            )}
            {entry.error && (
              <pre className="term-err">{entry.error}</pre>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form className="term-input-row" onSubmit={run}>
        <span className="ps-prompt">PS &gt;</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={busy ? 'Aguardando...' : 'comando...'}
          disabled={busy}
          autoFocus
        />
        <button type="submit" disabled={busy || !input.trim()}>↵</button>
      </form>
    </div>
  )
}
