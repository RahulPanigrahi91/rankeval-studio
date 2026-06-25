import React, { useEffect, useMemo, useState } from 'react'
import { collection, addDoc, getDocs, serverTimestamp, query, orderBy } from 'firebase/firestore'
import { db } from './firebase'
import './styles.css'

const EXP_COL = 'experiments'
const RAT_COL = 'ratings'

const seedExperiment = {
  name: 'Customer Support AI Response Quality - Sprint 12',
  status: 'Active',
  task: 'Rate AI responses for support quality',
  mode: 'Ranking',
  dimensions: [
    { name: 'Helpfulness', weight: 5, scale: 5 },
    { name: 'Accuracy', weight: 4, scale: 5 },
    { name: 'Tone', weight: 3, scale: 5 },
  ],
  outputs: [
    { label: 'GPT-4o Response', text: 'Thanks for reaching out. Here are the steps...' },
    { label: 'Claude 3.5 Response', text: 'I can help with that by first...' },
    { label: 'Gemini 1.5 Response', text: 'Sure — let us solve this by...' },
    { label: 'Internal Model v2', text: 'Please follow the instructions below...' },
  ],
}

const seedRatings = [
  { rater: 'Ananya', outputLabel: 'GPT-4o Response', dimension: 'Helpfulness', score: 4, timestamp: Date.now() - 900000 },
  { rater: 'Ananya', outputLabel: 'GPT-4o Response', dimension: 'Accuracy', score: 5, timestamp: Date.now() - 900000 },
  { rater: 'Ananya', outputLabel: 'GPT-4o Response', dimension: 'Tone', score: 4, timestamp: Date.now() - 900000 },
  { rater: 'Rohit', outputLabel: 'Claude 3.5 Response', dimension: 'Helpfulness', score: 5, timestamp: Date.now() - 800000 },
  { rater: 'Rohit', outputLabel: 'Claude 3.5 Response', dimension: 'Accuracy', score: 4, timestamp: Date.now() - 800000 },
  { rater: 'Rohit', outputLabel: 'Claude 3.5 Response', dimension: 'Tone', score: 5, timestamp: Date.now() - 800000 },
  { rater: 'Meera', outputLabel: 'Gemini 1.5 Response', dimension: 'Helpfulness', score: 3, timestamp: Date.now() - 700000 },
  { rater: 'Meera', outputLabel: 'Gemini 1.5 Response', dimension: 'Accuracy', score: 3, timestamp: Date.now() - 700000 },
  { rater: 'Meera', outputLabel: 'Gemini 1.5 Response', dimension: 'Tone', score: 4, timestamp: Date.now() - 700000 },
]

const avg = arr => arr.reduce((a, b) => a + b, 0) / Math.max(arr.length, 1)
const dcg = scores => scores.reduce((sum, s, i) => sum + ((2 ** s - 1) / Math.log2(i + 2)), 0)
const ndcgAtK = (scores, k = 3) => {
  const actual = scores.slice(0, k)
  const ideal = [...scores].sort((a, b) => b - a).slice(0, k)
  const idcg = dcg(ideal)
  return idcg ? (dcg(actual) / idcg).toFixed(3) : '0.000'
}

export default function App() {
  const [tab, setTab] = useState('experiments')
  const [experiments, setExperiments] = useState([])
  const [ratings, setRatings] = useState([])
  const [raterName, setRaterName] = useState('')
  const [selectedExpId, setSelectedExpId] = useState('')
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState({ name: '', task: '', mode: 'Ranking', status: 'Draft', dimName: 'Helpfulness', dimWeight: 5, dimScale: 5, outputLabel: '', outputText: '' })

  const fetchData = async () => {
    const expSnap = await getDocs(query(collection(db, EXP_COL), orderBy('createdAt', 'desc')))
    const ratSnap = await getDocs(query(collection(db, RAT_COL), orderBy('timestamp', 'desc')))
    const exps = expSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    const rats = ratSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    setExperiments(exps)
    setRatings(rats)
    setSelectedExpId(exps[0]?.id || '')
    setLoading(false)
    if (!exps.length) await seedDemo()
  }

  const seedDemo = async () => {
    const expRef = await addDoc(collection(db, EXP_COL), { ...seedExperiment, createdAt: serverTimestamp() })
    for (const r of seedRatings) {
      await addDoc(collection(db, RAT_COL), { ...r, experimentId: expRef.id, createdAt: serverTimestamp() })
    }
    await fetchData()
  }

  useEffect(() => { fetchData() }, [])

  const activeExp = experiments.find(e => e.id === selectedExpId) || experiments[0]
  const expRatings = useMemo(() => ratings.filter(r => r.experimentId === activeExp?.id), [ratings, activeExp])
  const outputStats = useMemo(() => {
    if (!activeExp) return []
    return activeExp.outputs.map(o => {
      const scores = expRatings.filter(r => r.outputLabel === o.label).map(r => r.score)
      return { label: o.label, score: avg(scores), count: scores.length }
    }).sort((a, b) => b.score - a.score)
  }, [activeExp, expRatings])

  const topOutput = outputStats[0]?.label || '-'
  const ndcg = ndcgAtK(outputStats.map(o => o.score), 3)
  const mrr = outputStats.length ? (1 / 1).toFixed(3) : '0.000'

  const createExperiment = async () => {
    if (!draft.name.trim()) return alert('Enter experiment name')
    const exp = {
      name: draft.name,
      task: draft.task,
      mode: draft.mode,
      status: draft.status,
      dimensions: [{ name: draft.dimName, weight: Number(draft.dimWeight), scale: Number(draft.dimScale) }],
      outputs: [{ label: draft.outputLabel || 'Model A', text: draft.outputText || 'Sample output text...' }],
      createdAt: serverTimestamp(),
    }
    await addDoc(collection(db, EXP_COL), exp)
    setDraft({ name: '', task: '', mode: 'Ranking', status: 'Draft', dimName: 'Helpfulness', dimWeight: 5, dimScale: 5, outputLabel: '', outputText: '' })
    await fetchData()
    setTab('experiments')
  }

  const addRating = async (outputLabel, dimension, score) => {
    if (!raterName.trim()) return alert('Enter anonymous rater name')
    if (!activeExp) return
    await addDoc(collection(db, RAT_COL), { experimentId: activeExp.id, rater: raterName, outputLabel, dimension, score: Number(score), timestamp: Date.now(), createdAt: serverTimestamp() })
    await fetchData()
  }

  const exportCsv = () => {
    const rows = [['rater_name','output_label','dimension_name','score','timestamp'], ...expRatings.map(r => [r.rater, r.outputLabel, r.dimension, r.score, r.timestamp])]
    const csv = rows.map(r => r.map(x => `"${String(x).replaceAll('"', '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'rankeval-results.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div className='app'><div className='main'>Loading...</div></div>

  return <div className='app'>
    <aside className='sidebar'>
      <h1>RankEval Studio</h1>
      <button onClick={() => setTab('experiments')}>Experiments</button>
      <button onClick={() => setTab('rate')}>Rate</button>
      <button onClick={() => setTab('dashboard')}>Dashboard</button>
    </aside>
    <main className='main'>
      {tab === 'experiments' && <section>
        <h2>Experiment Builder</h2>
        <div className='card grid2'>
          <input placeholder='Experiment name' value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
          <input placeholder='Task description' value={draft.task} onChange={e => setDraft({ ...draft, task: e.target.value })} />
          <select value={draft.mode} onChange={e => setDraft({ ...draft, mode: e.target.value })}><option>Ranking</option><option>Scoring</option></select>
          <button onClick={createExperiment}>Save Experiment</button>
        </div>
        <div className='card'>
          <strong>Seeded example:</strong> {experiments[0]?.name || 'Creating...'}
        </div>
      </section>}

      {tab === 'rate' && <section>
        <h2>Rater</h2>
        <div className='card grid2'>
          <input placeholder='Anonymous rater name' value={raterName} onChange={e => setRaterName(e.target.value)} />
          <select value={selectedExpId} onChange={e => setSelectedExpId(e.target.value)}>{experiments.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
        </div>
        {activeExp?.outputs?.map(o => <div className='card' key={o.label}>
          <strong>{o.label}</strong>
          <p>{o.text}</p>
          {activeExp.dimensions.map(d => <div key={d.name} className='ratingRow'>
            <span>{d.name}</span>
            <input type='range' min='1' max={d.scale} defaultValue={Math.ceil(d.scale / 2)} onMouseUp={e => addRating(o.label, d.name, e.target.value)} />
          </div>)}
        </div>)}
      </section>}

      {tab === 'dashboard' && <section>
        <h2>Dashboard</h2>
        <div className='grid4'>
          <div className='card'><strong>Total ratings</strong><div>{expRatings.length}</div></div>
          <div className='card'><strong>Top output</strong><div>{topOutput}</div></div>
          <div className='card'><strong>NDCG@3</strong><div>{ndcg}</div></div>
          <div className='card'><strong>MRR</strong><div>{mrr}</div></div>
        </div>
        <div className='card'>
          <button onClick={exportCsv}>Export CSV</button>
          {outputStats.map(o => <div key={o.label} className='barRow'><span>{o.label}</span><div className='bar'><div style={{ width: `${Math.min(100, o.score * 20)}%` }} /></div><span>{o.score.toFixed(2)}</span></div>)}
        </div>
      </section>}
    </main>
  </div>
}
