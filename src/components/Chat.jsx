import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { marked } from 'marked'
import './Chat.css'

const CLAUDE_API = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-6'

marked.setOptions({ breaks: true })

export default function Chat({ session }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('claude_api_key') || '')
  const [showKeyModal, setShowKeyModal] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    supabase
      .from('rc_messages')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: true })
      .limit(100)
      .then(({ data }) => { if (data) setMessages(data) })
  }, [session])

  useEffect(() => {
    const channel = supabase
      .channel('rc-chat')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'rc_messages',
        filter: `user_id=eq.${session.user.id}`
      }, (payload) => {
        setMessages(prev =>
          prev.find(m => m.id === payload.new.id) ? prev : [...prev, payload.new]
        )
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [session])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function sendMessage(e) {
    e.preventDefault()
    if (!input.trim() || loading) return
    if (!apiKey) { setKeyInput(''); setShowKeyModal(true); return }

    const userText = input.trim()
    setInput('')
    setLoading(true)

    await supabase.from('rc_messages').insert({
      user_id: session.user.id,
      role: 'user',
      content: userText
    })

    const history = messages.slice(-30).map(m => ({ role: m.role, content: m.content }))
    history.push({ role: 'user', content: userText })

    try {
      const res = await fetch(CLAUDE_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 4096,
          system: 'Você é Claude, assistente pessoal do Gabriel Almeida. Responda sempre em português brasileiro. Seja direto e conciso.',
          messages: history
        })
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error?.message || `HTTP ${res.status}`)
      }

      const data = await res.json()
      const reply = data.content[0].text

      await supabase.from('rc_messages').insert({
        user_id: session.user.id,
        role: 'assistant',
        content: reply
      })
    } catch (err) {
      await supabase.from('rc_messages').insert({
        user_id: session.user.id,
        role: 'assistant',
        content: `**Erro:** ${err.message}`
      })
    }

    setLoading(false)
  }

  function saveKey() {
    const k = keyInput.trim()
    if (!k) return
    localStorage.setItem('claude_api_key', k)
    setApiKey(k)
    setShowKeyModal(false)
  }

  async function clearHistory() {
    if (!confirm('Limpar todo o histórico?')) return
    await supabase.from('rc_messages').delete().eq('user_id', session.user.id)
    setMessages([])
  }

  return (
    <div className="chat">
      {showKeyModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3>Claude API Key</h3>
            <p>Necessária para enviar mensagens. Fica salva no seu browser.</p>
            <input
              type="password"
              placeholder="sk-ant-api03-..."
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveKey()}
              autoFocus
            />
            <div className="modal-actions">
              <button onClick={saveKey}>Salvar</button>
              <button className="secondary" onClick={() => setShowKeyModal(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <div className="chat-toolbar">
        <span className="chat-info">{messages.length} mensagens</span>
        <button onClick={clearHistory} className="btn-clear">Limpar histórico</button>
        <button onClick={() => { setKeyInput(apiKey); setShowKeyModal(true) }} className="btn-key">
          {apiKey ? '🔑 API Key ✓' : '🔑 Configurar API Key'}
        </button>
      </div>

      <div className="messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <p>Chat com Claude</p>
            <small>Configure a API Key e comece a conversar</small>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`message ${msg.role}`}>
            <div className="msg-label">{msg.role === 'user' ? 'Você' : 'Claude'}</div>
            <div
              className="msg-content"
              dangerouslySetInnerHTML={{ __html: marked.parse(msg.content) }}
            />
          </div>
        ))}
        {loading && (
          <div className="message assistant">
            <div className="msg-label">Claude</div>
            <div className="msg-content thinking">▋</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form className="chat-input" onSubmit={sendMessage}>
        <input
          type="text"
          placeholder={apiKey ? 'Mensagem para o Claude...' : 'Configure a API Key primeiro'}
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={loading}
        />
        <button type="submit" disabled={loading || !input.trim()}>→</button>
      </form>
    </div>
  )
}
