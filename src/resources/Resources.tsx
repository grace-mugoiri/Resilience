import { useState } from 'react'
import './resources.css'

type IconName = 'exit' | 'back' | 'legal' | 'medical' | 'shelter' | 'chat' | 'rights' | 'bookmark' | 'arrow' | 'offline' | 'search' | 'check' | 'clock' | 'pin' | 'phone' | 'home' | 'wallet' | 'settings'
const paths: Record<IconName, React.ReactNode> = {
  exit: <><path d="M10 5H5v14h5" /><path d="m14 8 4 4-4 4M8 12h10" /></>, back: <path d="m15 18-6-6 6-6" />, legal: <><path d="M12 3v18M5 6h14M6 6l-3 7h6L6 6ZM18 6l-3 7h6l-3-7ZM8 21h8" /></>, medical: <><path d="M3 7h11v11H3zM14 10h4l3 3v5h-7z" /><path d="M7 10v5M4.5 12.5h5M17 16h.01" /></>, shelter: <><path d="m3 11 9-8 9 8" /><path d="M5 10v11h14V10M9 21v-7h6v7" /></>,
  chat: <path d="M20 11.5a8 8 0 0 1-9.1 7.9L5 21l1.6-4A8 8 0 1 1 20 11.5Z" />, rights: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 7h6M9 11h6M9 15h4" /></>, bookmark: <path d="M6 3h12v18l-6-4-6 4V3Z" />, arrow: <path d="m9 5 7 7-7 7" />, offline: <><path d="M3 3l18 18M8.5 8.5A6 6 0 0 1 18 13M5 13a9 9 0 0 1 1.2-3.8M10 17h4" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>, check: <path d="m5 12 4 4L19 6" />, clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>, pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2" /></>, phone: <path d="M7 3h3l1.2 5-2 1.2a15 15 0 0 0 5.6 5.6l1.2-2 5 1.2v3c0 2-1 4-4 4C9.3 21 3 14.7 3 7c0-3 2-4 4-4Z" />,
  home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v11h14V10M9 21v-7h6v7" /></>, wallet: <><path d="M3 6h15a2 2 0 0 1 2 2v11H5a2 2 0 0 1-2-2V6Z" /><path d="M15 11h6v5h-6a2 2 0 0 1 0-5Z" /></>, settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>,
}
function Icon({ name, size = 23 }: { name: IconName; size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg> }

const guest = () => new URLSearchParams(window.location.search).get('mode') === 'guest'
const withMode = (path: string) => `${path}${guest() ? `${path.includes('?') ? '&' : '?'}mode=guest` : ''}`
const go = (path: string) => window.location.assign(withMode(path))
function Exit() { return <button className="resources-exit" onClick={() => window.location.replace('/')}><Icon name="exit" size={17} />Exit</button> }
function Header({ title, back }: { title: string; back?: () => void }) { return <header className="resources-header">{back && <button className="resources-back" onClick={back} aria-label="Go back"><Icon name="back" size={18} /></button>}<h1>{title}</h1><Exit /></header> }
function Nav() { return <nav className="resources-nav"><a className="active" href={withMode('/app')}><Icon name="home" /><span>Home</span></a><button><Icon name="chat" /><span>Messages</span></button><button><Icon name="wallet" /><span>Wallet</span></button><button><Icon name="settings" /><span>Settings</span></button></nav> }
function Help() { return <button className="resources-help" onClick={() => window.location.assign('/onboarding/emergency')}>Need help now?</button> }

const categories: Array<{ icon: IconName; title: string; slug: string }> = [
  { icon: 'legal', title: 'Legal help', slug: 'legal' }, { icon: 'medical', title: 'Medical care', slug: 'medical' }, { icon: 'shelter', title: 'Safe shelter', slug: 'shelter' }, { icon: 'chat', title: 'Counselling', slug: 'counselling' }, { icon: 'rights', title: 'Know your rights', slug: 'rights' },
]
const areas = ['Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Kiambu', 'Machakos', 'Uasin Gishu', 'Kajiado']
const resources = [
  { id: 'legal-aid-centre', name: 'Legal Aid Centre (placeholder)', description: 'Free legal advice for women affected by domestic violence', area: 'Nairobi CBD' },
  { id: 'fida-help-desk', name: 'FIDA Kenya Help Desk', description: 'Legal representation and protection order assistance', area: 'Community Area' },
  { id: 'national-legal-aid', name: 'National Legal Aid Service', description: 'State-funded legal aid and mediation services', area: 'Nairobi GPO' },
  { id: 'kituo-cha-sheria', name: 'Kituo Cha Sheria', description: 'Legal empowerment and access to justice for the poor', area: 'Pangani' },
]

function Hub() {
  const area = localStorage.getItem('resources-area') || 'Nairobi'
  return <div className="resources-screen"><Header title="Find resources" /><p className="nearby">Showing help near: <strong>{area}</strong> <button onClick={() => go('/app/resources/area')}>Change</button></p><div className="offline-note"><Icon name="offline" size={19} />Saved on this phone. Works without data.</div><main className="resource-categories">{categories.map((category) => <button onClick={() => category.slug === 'rights' ? go('/app/resources/rights') : go(`/app/resources/category/${category.slug}`)} key={category.slug}><span><Icon name={category.icon} /></span><strong>{category.title}</strong></button>)}</main><button className="saved-link" onClick={() => go('/app/resources/saved')}><span><Icon name="bookmark" /></span><strong>My saved list</strong><Icon name="arrow" size={18} /></button><a className="danger-call" href="tel:1195"><span><Icon name="phone" /></span><strong>In danger right now?<small>Call 1195 (free).</small></strong></a><Help /><Nav /></div>
}

function Area() {
  const [selected, setSelected] = useState(localStorage.getItem('resources-area') || 'Nairobi'), [search, setSearch] = useState('')
  const shown = areas.filter((area) => area.toLowerCase().includes(search.toLowerCase()))
  const choose = (area: string) => { localStorage.setItem('resources-area', area); setSelected(area); window.setTimeout(() => go('/app/resources'), 180) }
  return <div className="resources-screen"><Header title="Choose your area" back={() => go('/app/resources')} /><p className="area-privacy">We don’t use your phone’s location. Choose an area to see help nearby.</p><label className="area-search"><Icon name="search" size={19} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search county…" /></label><main className="area-list">{shown.map((area) => <button className={selected === area ? 'selected' : ''} onClick={() => choose(area)} key={area}>{area}{selected === area && <Icon name="check" />}</button>)}</main><Help /><Nav /></div>
}

function Category() {
  const [filter, setFilter] = useState('Free')
  const slug = window.location.pathname.split('/').pop() || 'legal'
  const title = categories.find((category) => category.slug === slug)?.title || 'Find resources'
  return <div className="resources-screen"><Header title={title} back={() => go('/app/resources')} /><div className="resource-filters">{['Free', 'Open now', 'Women-only'].map((item) => <button className={filter === item ? 'active' : ''} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div><main className="resource-list">{resources.map((resource) => <button onClick={() => go(`/app/resources/detail/${resource.id}`)} key={resource.id}><h2>{resource.name}</h2><p>{resource.description}</p><span><Icon name="pin" size={16} />{resource.area}</span><span><Icon name="clock" size={16} />Mon–Fri, 8am–5pm</span><strong><Icon name="check" size={16} />Checked by FIDA Kenya, Sep 2026</strong></button>)}</main><Help /><Nav /></div>
}

const readSaved = () => JSON.parse(localStorage.getItem('saved-resources') || '[]') as string[]
function Detail() {
  const id = window.location.pathname.split('/').pop() || resources[0].id
  const resource = resources.find((item) => item.id === id) || resources[0]
  const [saved, setSaved] = useState(readSaved().includes(id))
  const toggleSaved = () => { const current = readSaved(); const next = saved ? current.filter((item) => item !== id) : [...new Set([...current, id])]; localStorage.setItem('saved-resources', JSON.stringify(next)); setSaved(!saved) }
  return <div className="resources-screen detail-screen"><Header title={resource.name.replace(' (placeholder)', '')} back={() => go('/app/resources/category/legal')} /><section className="verified-resource"><span /><strong>Checked &amp; Verified<small>FIDA Kenya · Sep 2026</small></strong></section><main><section><h2>What they can help with</h2><ul><li>Protection orders</li><li>Child custody advice</li><li>Court representation</li></ul></section><section><h2>What to bring</h2><ul><li>National ID or copy</li><li>Any court documents you have</li></ul></section><section className="detail-meta"><span><Icon name="clock" size={18} />Mon–Fri, 8am–5pm</span><span><Icon name="pin" size={18} />{resource.area}</span></section></main><a className="resources-primary" href="tel:0700000000"><Icon name="phone" size={19} />Call 0700 000 000</a><button className="resources-secondary" onClick={toggleSaved}><Icon name="bookmark" size={19} />{saved ? 'Remove from my list' : 'Save to my list'}</button><p className="call-warning">Placeholder number. Real organizations and contact details must be partner-verified before launch. Calls appear in your phone history.</p><Help /><Nav /></div>
}

function Saved() {
  const saved = readSaved(), items = resources.filter((resource) => saved.includes(resource.id))
  return <div className="resources-screen"><Header title="My saved list" back={() => go('/app/resources')} /><main className={`saved-content ${items.length ? 'has-items' : ''}`}>{items.length ? items.map((item) => <button onClick={() => go(`/app/resources/detail/${item.id}`)} key={item.id}><strong>{item.name}</strong><span>{item.area}</span><Icon name="arrow" /></button>) : <><span><Icon name="bookmark" size={38} /></span><h2>Nothing saved yet</h2><p>Save places you might need later so they’re here even without data.</p></>}</main><Help /><Nav /></div>
}

const guides = [{ title: 'What to expect when you report to the police', time: '4 min read' }, { title: 'Getting medical care after sexual violence: why the first 72 hours matter', time: '5 min read', article: true }, { title: 'Your rights to child custody and support', time: '3 min read' }, { title: 'How to get a protection order', time: '4 min read' }]
function Rights() { return <div className="resources-screen"><Header title="Know your rights" back={() => go('/app/resources')} /><main className="guide-list">{guides.map((guide) => <button onClick={() => guide.article && go('/app/resources/rights/medical-care')} key={guide.title}><strong>{guide.title}</strong><span>{guide.time}</span><Icon name="arrow" /></button>)}</main><Help /><Nav /></div> }
function Article() { return <div className="resources-screen article-screen"><Header title="Medical care" back={() => go('/app/resources/rights')} /><main><h1>Getting medical care after sexual violence</h1><h2>Why the first 72 hours matter</h2><h3>1. Go to any hospital — you don’t need a police report first.</h3><p>Hospitals must treat you immediately in emergency cases. You do not have to report the incident to the police before receiving medical attention.</p><h3>2. Ask for PEP (medicine to prevent HIV) — it must be started within 72 hours.</h3><p>Post-Exposure Prophylaxis (PEP) is most effective when started quickly. Every hour counts.</p><aside>You can get care even if you don’t want to report to the police.</aside><p className="article-source">Placeholder guide content. Must be reviewed and supplied by a qualified partner organization before launch.</p></main><button className="resources-primary" onClick={() => go('/app/resources/category/medical')}><Icon name="pin" size={19} />Find medical care near me</button><button className="resources-secondary" onClick={() => go('/app/counselors')}><Icon name="chat" size={19} />Talk to someone</button><Help /><Nav /></div> }

export default function Resources() {
  const path = window.location.pathname
  if (path.endsWith('/area')) return <Area />
  if (path.includes('/category/')) return <Category />
  if (path.includes('/detail/')) return <Detail />
  if (path.endsWith('/saved')) return <Saved />
  if (path.endsWith('/rights/medical-care')) return <Article />
  if (path.endsWith('/rights')) return <Rights />
  return <Hub />
}
