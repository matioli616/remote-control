import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import './FileManager.css'

export default function FileManager({ session }) {
  const [path, setPath] = useState('C:\\Users\\PC')
  const [files, setFiles] = useState([])
  const [selected, setSelected] = useState(null)
  const [content, setContent] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const pendingCmd = useRef(null)

  useEffect(() => {
    const channel = supabase
      .channel('rc-files')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'rc_commands',
        filter: `user_id=eq.${session.user.id}`
      }, (payload) => {
        if (!pendingCmd.current) return
        if (payload.new.id !== pendingCmd.current.id) return

        const { type } = pendingCmd.current
        pendingCmd.current = null

        if (payload.new.status === 'done') {
          if (type === 'file_list') {
            try { setFiles(JSON.parse(payload.new.output)) }
            catch { setFiles([]) }
          } else if (type === 'file_read') {
            setContent(payload.new.output || '')
            setEditContent(payload.new.output || '')
          } else if (type === 'file_write') {
            setContent(editContent)
            setEditing(false)
            setStatus('Salvo!')
            setTimeout(() => setStatus(''), 2000)
          }
          setBusy(false)
        } else if (payload.new.status === 'error') {
          setStatus('Erro: ' + (payload.new.error || 'desconhecido'))
          setBusy(false)
        }
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [session, editContent])

  async function sendCmd(type, payload) {
    setBusy(true)
    setStatus('')
    const { data, error } = await supabase
      .from('rc_commands')
      .insert({ user_id: session.user.id, type, payload, status: 'pending' })
      .select()
      .single()
    if (error) { setBusy(false); return }
    pendingCmd.current = { id: data.id, type }
  }

  function go(p) {
    const target = p || path
    setFiles([])
    setContent('')
    setSelected(null)
    setEditing(false)
    sendCmd('file_list', { path: target })
  }

  function openFile(name) {
    const full = joinPath(path, name)
    setSelected(full)
    setContent('')
    sendCmd('file_read', { path: full })
  }

  function openDir(name) {
    const newPath = joinPath(path, name)
    setPath(newPath)
    go(newPath)
  }

  function goUp() {
    const parts = path.replace(/\//g, '\\').split('\\').filter(Boolean)
    if (parts.length <= 1) return
    parts.pop()
    const newPath = parts.join('\\')
    setPath(newPath || 'C:\\')
    go(newPath || 'C:\\')
  }

  function saveFile() {
    sendCmd('file_write', { path: selected, content: editContent })
  }

  function joinPath(base, name) {
    return base.replace(/\\+$/, '') + '\\' + name
  }

  function fmtSize(b) {
    if (!b) return ''
    if (b < 1024) return b + 'B'
    if (b < 1048576) return (b / 1024).toFixed(1) + 'K'
    return (b / 1048576).toFixed(1) + 'M'
  }

  return (
    <div className="fm">
      <div className="fm-bar">
        <button onClick={goUp} title="Subir um nível">↑</button>
        <input
          type="text"
          value={path}
          onChange={e => setPath(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && go()}
          placeholder="C:\caminho\..."
        />
        <button onClick={() => go()} disabled={busy}>{busy ? '...' : 'Ir'}</button>
        {status && <span className="fm-status">{status}</span>}
      </div>

      <div className="fm-body">
        <div className="fm-list">
          {files.length === 0 && !busy && (
            <div className="fm-hint">Digite um caminho e clique em Ir</div>
          )}
          {busy && files.length === 0 && (
            <div className="fm-hint">Carregando...</div>
          )}
          {files.map((f, i) => (
            <div
              key={i}
              className={`fm-row ${f.type} ${selected?.endsWith('\\' + f.name) ? 'active' : ''}`}
              onClick={() => f.type === 'dir' ? openDir(f.name) : openFile(f.name)}
            >
              <span className="fm-icon">{f.type === 'dir' ? '▶' : '·'}</span>
              <span className="fm-name">{f.name}</span>
              {f.size != null && <span className="fm-sz">{fmtSize(f.size)}</span>}
            </div>
          ))}
        </div>

        <div className="fm-viewer">
          {selected && (
            <div className="fm-vbar">
              <span className="fm-path">{selected}</span>
              <div className="fm-vactions">
                {editing ? (
                  <>
                    <button onClick={saveFile} disabled={busy}>Salvar</button>
                    <button onClick={() => { setEditing(false); setEditContent(content) }}>Cancelar</button>
                  </>
                ) : (
                  <button onClick={() => setEditing(true)} disabled={!content || busy}>Editar</button>
                )}
              </div>
            </div>
          )}
          {!selected && (
            <div className="fm-no-sel">Selecione um arquivo para visualizar</div>
          )}
          {selected && editing ? (
            <textarea
              className="fm-editor"
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
            />
          ) : (
            <pre className="fm-preview">
              {busy && !content ? 'Carregando...' : content}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
