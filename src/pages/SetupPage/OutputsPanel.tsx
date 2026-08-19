import { useState, useEffect } from 'react'
import { useOutputsStore, type OutputType, type MxlTap, type MxlAudioSource, type MxlBackend } from '@/store/outputs.store'
import { useProductionsStore } from '@/store/productions.store'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { StatusDot } from '@/components/ui/StatusDot'

const CREATABLE_OUTPUT_TYPES: OutputType[] = ['mpegtssrt', 'efpsrt', 'mxl']

const OUTPUT_TYPE_LABELS: Record<OutputType, string> = {
  mpegtssrt: 'MPEG-TS/SRT',
  efpsrt: 'EFP/SRT',
  whep: 'WHEP',
  mxl: 'MXL',
}

function outputTypeBadge(outputType: OutputType, mxlTap?: MxlTap): string {
  if (outputType === 'mxl') return mxlTap === 'multiview' ? 'MXL (Multiview)' : 'MXL (PGM)'
  return OUTPUT_TYPE_LABELS[outputType]
}

function timeSince(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000)
  if (secs < 5) return 'just now'
  if (secs < 60) return `${secs}s ago`
  return `${Math.floor(secs / 60)}m ago`
}

const inputCls = 'w-full px-3 py-2 rounded bg-[--color-surface-raised] border border-[--color-border-strong] text-sm text-[--color-text-primary] focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DEFAULT_SRT_URL = 'srt://:43524?mode=listener'

type MxlForm = {
  mxlTap: MxlTap
  mxlDomain: string
  mxlAudioFlowId: string
  mxlAudioSource: MxlAudioSource
  mxlBackend: MxlBackend
}

const DEFAULT_MXL: MxlForm = {
  mxlTap: 'pgm',
  mxlDomain: '/dev/shm/mxl',
  mxlAudioFlowId: '',
  mxlAudioSource: 'main',
  mxlBackend: 'auto',
}

function MxlFormFields({ value, onChange, urlError }: {
  value: { url: string } & MxlForm
  onChange: (next: { url: string } & MxlForm) => void
  urlError: string | null
}) {
  return (
    <>
      <div>
        <label className="text-xs text-[--color-text-muted] uppercase tracking-wider block mb-1">Tap</label>
        <div className="grid grid-cols-2 gap-2">
          {(['pgm', 'multiview'] as MxlTap[]).map((tap) => (
            <button
              key={tap}
              type="button"
              onClick={() => onChange({ ...value, mxlTap: tap })}
              className={`py-2 rounded text-sm border transition-colors ${
                value.mxlTap === tap
                  ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-white'
                  : 'bg-[var(--color-surface-2)] border-[var(--color-border-strong)] text-[var(--color-text-muted)] hover:text-orange-500'
              }`}
            >
              {tap === 'pgm' ? 'PGM' : 'Multiview'}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-xs text-[--color-text-muted] uppercase tracking-wider block mb-1">Video flow UUID</label>
        <input
          type="text"
          value={value.url}
          onChange={(e) => onChange({ ...value, url: e.target.value })}
          placeholder="00000000-0000-4000-8000-000000000010"
          className={inputCls}
        />
        {urlError && <p className="text-xs text-red-400 mt-1">{urlError}</p>}
      </div>
      <div>
        <label className="text-xs text-[--color-text-muted] uppercase tracking-wider block mb-1">
          Audio flow UUID <span className="normal-case opacity-60">(optional)</span>
        </label>
        <input
          type="text"
          value={value.mxlAudioFlowId}
          onChange={(e) => onChange({ ...value, mxlAudioFlowId: e.target.value })}
          placeholder="00000000-0000-4000-8000-000000000011"
          className={inputCls}
        />
      </div>
      <div>
        <label className="text-xs text-[--color-text-muted] uppercase tracking-wider block mb-1">Domain</label>
        <input
          type="text"
          value={value.mxlDomain}
          onChange={(e) => onChange({ ...value, mxlDomain: e.target.value })}
          placeholder="/dev/shm/mxl"
          className={inputCls}
        />
      </div>
      <div>
        <label className="text-xs text-[--color-text-muted] uppercase tracking-wider block mb-1">Backend</label>
        <select
          value={value.mxlBackend}
          onChange={(e) => onChange({ ...value, mxlBackend: e.target.value as MxlBackend })}
          className={inputCls}
        >
          <option value="auto">auto</option>
          <option value="gpu">gpu</option>
          <option value="cpu">cpu</option>
        </select>
      </div>
      <div>
        <label className="text-xs text-[--color-text-muted] uppercase tracking-wider block mb-1">Audio source</label>
        <select
          value={value.mxlAudioSource}
          onChange={(e) => onChange({ ...value, mxlAudioSource: e.target.value as MxlAudioSource })}
          className={inputCls}
        >
          <option value="main">main</option>
          <option value="monitor">monitor</option>
        </select>
      </div>
    </>
  )
}

export function OutputsPanel() {
  const { outputs, isLoading, lastFetchedAt, addOutput, updateOutput, removeOutput, fetchAll } = useOutputsStore()
  const productions = useProductionsStore((s) => s.productions)

  useEffect(() => {
    void fetchAll()
    const id = setInterval(() => void fetchAll(), 15000)
    return () => clearInterval(id)
  }, [fetchAll])

  const activeOutputIds = new Set(
    productions
      .filter((p) => p.status === 'active' || p.status === 'activating')
      .flatMap((p) => p.outputAssignments.map((o) => o.outputId)),
  )

  const [addOpen, setAddOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<{ id: string; name: string; url: string; outputType: OutputType } & MxlForm | null>(null)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [addUrlError, setAddUrlError] = useState<string | null>(null)
  const [editUrlError, setEditUrlError] = useState<string | null>(null)

  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<OutputType>('mpegtssrt')
  const [newUrl, setNewUrl] = useState(DEFAULT_SRT_URL)
  const [newMxl, setNewMxl] = useState<MxlForm>(DEFAULT_MXL)

  function resetAdd() {
    setNewName('')
    setNewType('mpegtssrt')
    setNewUrl(DEFAULT_SRT_URL)
    setNewMxl(DEFAULT_MXL)
    setAddUrlError(null)
  }

  function isValidSrtUrl(s: string): boolean {
    return /^srt:\/\/[^?#]*:\d+/.test(s.trim())
  }

  function parseUuid(value: string): string | null {
    const id = value.trim().replace(/^mxl:\/\//i, '').replace(/\/+$/, '')
    return UUID_RE.test(id) ? id : null
  }

  async function handleAdd() {
    if (!newName.trim()) return
    if (newType === 'mxl') {
      if (!parseUuid(newUrl)) { setAddUrlError('Must be a video flow UUID'); return }
      if (newMxl.mxlAudioFlowId.trim() && !parseUuid(newMxl.mxlAudioFlowId)) {
        setAddUrlError('Audio flow ID must be a UUID'); return
      }
      const duplicate = outputs.find((o) => o.url?.trim() === newUrl.trim())
      if (duplicate) { setAddUrlError(`Flow ID already used by "${duplicate.name}"`); return }
      await addOutput({
        name: newName.trim(),
        outputType: 'mxl',
        url: newUrl.trim(),
        mxlTap: newMxl.mxlTap,
        mxlDomain: newMxl.mxlDomain.trim() || '/dev/shm/mxl',
        mxlAudioFlowId: newMxl.mxlAudioFlowId.trim() || undefined,
        mxlAudioSource: newMxl.mxlAudioSource,
        mxlBackend: newMxl.mxlBackend,
      })
    } else {
      if (!newUrl.trim()) return
      if (!isValidSrtUrl(newUrl.trim())) { setAddUrlError('Must be a valid srt:// URI'); return }
      const duplicate = outputs.find((o) => o.url?.trim() === newUrl.trim())
      if (duplicate) { setAddUrlError(`Address already used by "${duplicate.name}"`); return }
      await addOutput({ name: newName.trim(), outputType: newType, url: newUrl.trim() })
    }
    resetAdd()
    setAddOpen(false)
  }

  async function handleEdit() {
    if (!editTarget || !editTarget.name.trim()) return
    const url = editTarget.url.trim()
    if (editTarget.outputType === 'mxl') {
      if (url && !parseUuid(url)) { setEditUrlError('Must be a video flow UUID'); return }
      if (editTarget.mxlAudioFlowId.trim() && !parseUuid(editTarget.mxlAudioFlowId)) {
        setEditUrlError('Audio flow ID must be a UUID'); return
      }
      if (url) {
        const duplicate = outputs.find((o) => o.id !== editTarget.id && o.url?.trim() === url)
        if (duplicate) { setEditUrlError(`Flow ID already used by "${duplicate.name}"`); return }
      }
      await updateOutput(editTarget.id, {
        name: editTarget.name.trim(),
        url: url || undefined,
        mxlTap: editTarget.mxlTap,
        mxlDomain: editTarget.mxlDomain.trim() || '/dev/shm/mxl',
        mxlAudioFlowId: editTarget.mxlAudioFlowId.trim() || undefined,
        mxlAudioSource: editTarget.mxlAudioSource,
        mxlBackend: editTarget.mxlBackend,
      })
    } else {
      if (url) {
        if (!isValidSrtUrl(url)) { setEditUrlError('Must be a valid srt:// URI'); return }
        const duplicate = outputs.find((o) => o.id !== editTarget.id && o.url?.trim() === url)
        if (duplicate) { setEditUrlError(`Address already used by "${duplicate.name}"`); return }
      }
      await updateOutput(editTarget.id, { name: editTarget.name.trim(), url: url || undefined })
    }
    setEditUrlError(null)
    setEditTarget(null)
  }

  async function handleDelete(id: string) {
    setDeleteError(null)
    try {
      await removeOutput(id)
      setDeleteTargetId(null)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete output')
    }
  }

  const deleteTarget = deleteTargetId ? outputs.find((o) => o.id === deleteTargetId) : null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[--color-text-muted] font-mono">
            {outputs.length} outputs · refreshed {timeSince(lastFetchedAt)}
          </span>
          {isLoading && <span className="text-xs text-[--color-accent]">Refreshing…</span>}
        </div>
        <Button size="sm" variant="active" onClick={() => setAddOpen(true)}>+ New Output</Button>
      </div>

      <div className="flex flex-col gap-1">
        {outputs.map((o) => {
          const inActiveProd = activeOutputIds.has(o.id)
          return (
            <div
              key={o.id}
              className={`flex items-center gap-3 px-3 py-2.5 rounded bg-[--color-surface-3] border transition-colors ${
                inActiveProd
                  ? 'border-[--color-border] hover:border-zinc-600 cursor-not-allowed'
                  : 'border-[--color-border] hover:border-orange-500 cursor-pointer'
              }`}
              onClick={() => !inActiveProd && setEditTarget({
                id: o.id,
                name: o.name,
                url: o.url ?? '',
                outputType: o.outputType,
                mxlTap: o.mxlTap ?? 'pgm',
                mxlDomain: o.mxlDomain ?? '/dev/shm/mxl',
                mxlAudioFlowId: o.mxlAudioFlowId ?? '',
                mxlAudioSource: o.mxlAudioSource ?? 'main',
                mxlBackend: o.mxlBackend ?? 'auto',
              })}
            >
              <StatusDot color={inActiveProd ? 'red' : 'gray'} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[--color-text-primary] truncate">{o.name}</span>
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-[--color-surface-raised] text-[--color-text-muted] uppercase">
                    {outputTypeBadge(o.outputType, o.mxlTap)}
                  </span>
                </div>
                {o.url && (
                  <span className="text-xs text-[--color-text-muted] font-mono truncate block">{o.url}</span>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation()
                  if (inActiveProd) return
                  setEditTarget({
                    id: o.id,
                    name: o.name,
                    url: o.url ?? '',
                    outputType: o.outputType,
                    mxlTap: o.mxlTap ?? 'pgm',
                    mxlDomain: o.mxlDomain ?? '/dev/shm/mxl',
                    mxlAudioFlowId: o.mxlAudioFlowId ?? '',
                    mxlAudioSource: o.mxlAudioSource ?? 'main',
                    mxlBackend: o.mxlBackend ?? 'auto',
                  })
                }}
                disabled={inActiveProd}
                className="text-white hover:text-orange-500 disabled:opacity-30 disabled:cursor-not-allowed"
                title={inActiveProd ? 'Cannot edit output in an active production' : 'Edit output'}
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => { e.stopPropagation(); setDeleteError(null); setDeleteTargetId(o.id) }}
                disabled={inActiveProd}
                className="text-white hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
                title={inActiveProd ? 'Output is in an active production' : 'Delete output'}
              >
                Delete
              </Button>
            </div>
          )
        })}
        {outputs.length === 0 && !isLoading && (
          <p className="text-sm text-[--color-text-muted] py-4 text-center">
            No outputs yet. Add one to send program video to an external destination.
          </p>
        )}
      </div>

      {deleteTarget && (
        <Modal open title="Delete Output" onClose={() => { setDeleteTargetId(null); setDeleteError(null) }} className="max-w-sm">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-[--color-text-primary]">
              Delete <span className="font-semibold">{deleteTarget.name}</span>? This cannot be undone.
            </p>
            {deleteError && <p className="text-xs text-red-400">{deleteError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { setDeleteTargetId(null); setDeleteError(null) }}>Cancel</Button>
              <Button variant="danger" onClick={() => void handleDelete(deleteTarget.id)}>Delete</Button>
            </div>
          </div>
        </Modal>
      )}

      <Modal open={addOpen} title="New Output" onClose={() => { resetAdd(); setAddOpen(false) }}>
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-[--color-text-muted] uppercase tracking-wider block mb-1">Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={newType === 'mxl' ? 'MXL PGM' : 'Program SRT'}
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-xs text-[--color-text-muted] uppercase tracking-wider block mb-1">Type</label>
            <div className="grid grid-cols-2 gap-2">
              {CREATABLE_OUTPUT_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setNewType(t)
                    setNewUrl(t === 'mxl' ? '' : DEFAULT_SRT_URL)
                    setNewMxl(DEFAULT_MXL)
                    setAddUrlError(null)
                  }}
                  className={`py-2 rounded text-sm border transition-colors ${
                    newType === t
                      ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-white'
                      : 'bg-[var(--color-surface-2)] border-[var(--color-border-strong)] text-[var(--color-text-muted)] hover:text-orange-500'
                  }`}
                >
                  {OUTPUT_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
          {newType === 'mxl' ? (
            <MxlFormFields
              value={{ url: newUrl, ...newMxl }}
              onChange={(next) => {
                setNewUrl(next.url)
                setNewMxl({
                  mxlTap: next.mxlTap,
                  mxlDomain: next.mxlDomain,
                  mxlAudioFlowId: next.mxlAudioFlowId,
                  mxlAudioSource: next.mxlAudioSource,
                  mxlBackend: next.mxlBackend,
                })
                setAddUrlError(null)
              }}
              urlError={addUrlError}
            />
          ) : (
            <div>
              <label className="text-xs text-[--color-text-muted] uppercase tracking-wider block mb-1">SRT URI</label>
              <input
                type="text"
                value={newUrl}
                onChange={(e) => { setNewUrl(e.target.value); setAddUrlError(null) }}
                placeholder={DEFAULT_SRT_URL}
                className={inputCls}
              />
              {addUrlError && <p className="text-xs text-red-400 mt-1">{addUrlError}</p>}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => { resetAdd(); setAddOpen(false) }}>Cancel</Button>
            <Button variant="active" onClick={() => void handleAdd()} disabled={!newName.trim() || (newType !== 'mxl' && !newUrl.trim()) || (newType === 'mxl' && !newUrl.trim())}>
              Save
            </Button>
          </div>
        </div>
      </Modal>

      {editTarget && (
        <Modal open title="Edit Output" onClose={() => { setEditTarget(null); setEditUrlError(null) }}>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs text-[--color-text-muted] uppercase tracking-wider block mb-1">Name</label>
              <input
                type="text"
                value={editTarget.name}
                onChange={(e) => setEditTarget({ ...editTarget, name: e.target.value })}
                className={inputCls}
              />
            </div>
            {editTarget.outputType === 'mxl' ? (
              <MxlFormFields
                value={editTarget}
                onChange={(next) => { setEditTarget({ ...editTarget, ...next }); setEditUrlError(null) }}
                urlError={editUrlError}
              />
            ) : (
              <div>
                <label className="text-xs text-[--color-text-muted] uppercase tracking-wider block mb-1">SRT URI</label>
                <input
                  type="text"
                  value={editTarget.url}
                  onChange={(e) => { setEditTarget({ ...editTarget, url: e.target.value }); setEditUrlError(null) }}
                  className={inputCls}
                />
                {editUrlError && <p className="text-xs text-red-400 mt-1">{editUrlError}</p>}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => { setEditTarget(null); setEditUrlError(null) }}>Cancel</Button>
              <Button variant="active" onClick={() => void handleEdit()} disabled={!editTarget.name.trim()}>
                Save
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
