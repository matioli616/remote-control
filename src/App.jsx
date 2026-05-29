import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import Login from './components/Login'
import Chat from './components/Chat'
import Terminal from './components/Terminal'
import FileManager from './components/FileManager'
import './App.css'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('chat')
  const [pcOnline, setPcOnline] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    let timer
    const channel = supabase
      .channel('pc-status')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'rc_commands',
        filter: `user_id=eq.${session.user.id}`
      }, (payload) => {
        if (payload.new.status === 'done' || payload.new.status === 'error') {
          setPcOnline(true)
          clearTimeout(timer)
          timer = setTimeout(() => setPcOnline(false), 60000)
        }
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
      clearTimeout(timer)
    }
  }, [session])

  if (loading) return <div className="loading">...</div>
  if (!session) return <Login />

  return (
    <div className="app">
      <header className="header">
        <span className="logo">⚡ Remote Control</span>
        <nav className="tabs">
          <button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>Chat</button>
          <button className={tab === 'terminal' ? 'active' : ''} onClick={() => setTab('terminal')}>Terminal</button>
          <button className={tab === 'files' ? 'active' : ''} onClick={() => setTab('files')}>Arquivos</button>
        </nav>
        <div className="header-right">
          <span className={`pc-status ${pcOnline ? 'online' : 'offline'}`}>
            {pcOnline ? '● PC Online' : '○ PC Offline'}
          </span>
          <button className="btn-logout" onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
      </header>
      <main className="main">
        {tab === 'chat' && <Chat session={session} />}
        {tab === 'terminal' && <Terminal session={session} />}
        {tab === 'files' && <FileManager session={session} />}
      </main>
    </div>
  )
}
