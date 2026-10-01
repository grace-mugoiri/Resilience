import { useState } from 'react'
import './wallet.css'

type IconName = 'back' | 'exit' | 'eyeOff' | 'home' | 'chat' | 'wallet' | 'settings' | 'check' | 'phone' | 'shield' | 'sms'
const paths: Record<IconName, React.ReactNode> = {
  back: <path d="m15 18-6-6 6-6" />, exit: <><path d="M10 5H5v14h5" /><path d="m14 8 4 4-4 4M8 12h10" /></>, eyeOff: <><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.8 5.2A10.8 10.8 0 0 1 12 5c5.5 0 9 7 9 7a17 17 0 0 1-2.1 3.1M6.2 6.2C4.1 7.7 3 12 3 12s3.5 7 9 7c1 0 1.9-.2 2.7-.5" /></>,
  home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v11h14V10M9 21v-7h6v7" /></>, chat: <path d="M20 11.5a8 8 0 0 1-9.1 7.9L5 21l1.6-4A8 8 0 1 1 20 11.5Z" />, wallet: <><path d="M3 6h15a2 2 0 0 1 2 2v11H5a2 2 0 0 1-2-2V6Z" /><path d="M15 11h6v5h-6a2 2 0 0 1 0-5Z" /></>, settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>,
  check: <path d="m5 12 4 4L19 6" />, phone: <path d="M7 3h3l1.2 5-2 1.2a15 15 0 0 0 5.6 5.6l1.2-2 5 1.2v3c0 2-1 4-4 4C9.3 21 3 14.7 3 7c0-3 2-4 4-4Z" />, shield: <path d="M12 3 5.5 6v5.2c0 4.2 2.7 8 6.5 9.8 3.8-1.8 6.5-5.6 6.5-9.8V6L12 3Z" />, sms: <path d="M20 11.5a8 8 0 0 1-9.1 7.9L5 21l1.6-4A8 8 0 1 1 20 11.5Z" />,
}
function Icon({ name, size = 23 }: { name: IconName; size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg> }
const go = (path: string) => window.location.assign(path)
function Header({ title, back }: { title: string; back?: () => void }) { return <header className="wallet-header"><button className="wallet-back" onClick={back ?? (() => go('/app/wallet'))} aria-label="Go back"><Icon name="back" size={18} /></button><h1>{title}</h1><button className="wallet-exit" onClick={() => window.location.replace('/')}><Icon name="exit" size={17} />Exit</button></header> }
function Nav() { return <nav className="wallet-nav"><a href="/app"><Icon name="home" /><span>Home</span></a><a href="/app/messages"><Icon name="chat" /><span>Messages</span></a><a className="active" href="/app/wallet"><Icon name="wallet" /><span>Wallet</span></a><a href="/app/settings"><Icon name="settings" /><span>Settings</span></a></nav> }

const payments = [{ color: 'amber', title: 'Emergency Grant', meta: 'Today · Pending', amount: 'KES 5,000' }, { color: 'green', title: 'Support Payment', meta: 'Yesterday · Received', amount: 'KES 3,500' }, { color: 'red', title: 'Emergency Grant', meta: '12 Oct · Failed', amount: 'KES 5,000' }, { color: 'grey', title: 'Travel Assistance', meta: '05 Oct · Expired', amount: 'KES 1,200' }]
function WalletHome() {
  const [shown, setShown] = useState(false)
  return <div className="wallet-screen"><Header title="My wallet" back={() => go('/app')} /><div className="test-mode">TEST MODE: no real money</div><button className="balance-card" onClick={() => setShown((value) => !value)}><span>Available Balance</span><strong>{shown ? 'KES 1,500' : 'Tap to show balance'}</strong>{!shown && <Icon name="eyeOff" />}</button><p className="wallet-info">Money sent to you stays here until you choose to withdraw. Withdrawing sends an M-Pesa message to your phone, so choose a time that’s safe for you.</p><button className="wallet-primary" onClick={() => go('/app/wallet/withdraw')}>Withdraw now</button><button className="wallet-secondary" onClick={() => go('/app/wallet/schedule')}>Schedule a withdrawal</button><h2 className="recent-title">Recent payments</h2><main className="payment-list">{payments.map((payment, index) => <article key={`${payment.title}-${index}`}><span className={payment.color} /><span><strong>{payment.title}</strong><small>{payment.meta}</small></span><b>{payment.amount}</b></article>)}</main><Nav /></div>
}

function Withdraw() {
  const [amount, setAmount] = useState('1000'), [phone, setPhone] = useState('')
  const numericAmount = Number(amount), digits = phone.replace(/\D/g, ''), valid = numericAmount > 0 && numericAmount <= 1500 && digits.length >= 9
  const review = () => { sessionStorage.setItem('wallet-review', JSON.stringify({ amount: numericAmount, last3: digits.slice(-3) })); go('/app/wallet/confirm') }
  return <div className="wallet-screen form-screen"><Header title="Withdraw to M-Pesa" back={() => go('/app/wallet')} /><main><h2>Withdraw Funds</h2><p>Transfer money directly from your wallet to M-Pesa.</p><label>Amount to Withdraw</label><div className="amount-input"><span>KES</span><input inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/g, ''))} aria-label="Withdrawal amount" /><button onClick={() => setAmount('1500')}>MAX</button></div><small>Available Balance: KES 1,500.00</small><label>M-Pesa Phone Number</label><div className={`phone-input ${digits.length >= 9 ? 'valid' : ''}`}><span>🇰🇪 +254</span><input inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="0712 345 678" aria-label="M-Pesa phone number" />{digits.length >= 9 && <Icon name="check" />}</div><small>Must be registered with Safaricom M-Pesa. Used only for this test withdrawal and not retained afterward.</small></main><button className="wallet-primary" disabled={!valid} onClick={review}>Review Withdrawal</button><Nav /></div>
}

const reviewData = () => { try { return JSON.parse(sessionStorage.getItem('wallet-review') || '') as { amount: number; last3: string } } catch { return { amount: 1000, last3: '678' } } }
function Confirm() {
  const data = reviewData(), fee = 15, total = data.amount + fee
  return <div className="wallet-screen confirm-screen"><Header title="Confirm Transaction" back={() => go('/app/wallet/withdraw')} /><main><h2>Confirmation</h2><p>Review your transfer specifics to Safaricom M-Pesa.</p><section className="confirm-card"><span>Total to Deduct</span><strong>KES {total.toLocaleString()}.00</strong><dl><div><dt>Withdrawal Amount</dt><dd>KES {data.amount.toLocaleString()}.00</dd></div><div><dt>Network/M-Pesa Fee</dt><dd>KES {fee}.00</dd></div><div><dt>Recipient Number</dt><dd>•••• {data.last3}</dd></div></dl></section><aside><Icon name="sms" /><span><strong>Instant Delivery Notification</strong><p>An M-Pesa SMS will arrive on this phone as soon as you confirm.</p></span></aside></main><button className="wallet-primary" onClick={() => { sessionStorage.removeItem('wallet-review'); sessionStorage.setItem('wallet-last3', data.last3); sessionStorage.setItem('wallet-last-amount', String(data.amount)); go('/app/wallet/sent') }}>Confirm Withdrawal</button><button className="wallet-secondary" onClick={() => go('/app/wallet/schedule')}>Choose another time</button><Nav /></div>
}

function Sent() { const last3 = sessionStorage.getItem('wallet-last3') || '678', amount = Number(sessionStorage.getItem('wallet-last-amount') || 1000); return <div className="wallet-screen status-wallet"><Header title="Withdrawal sent" back={() => go('/app/wallet')} /><main><span className="success-check"><Icon name="check" size={44} /></span><h2>KES {amount.toLocaleString()} is on its way</h2><p>An M-Pesa SMS will arrive at •••• {last3} shortly.</p><aside><Icon name="sms" /><span><strong>M-Pesa SMS on its way</strong><p>Your test withdrawal was confirmed. No real payment was sent.</p></span></aside></main><button className="wallet-primary" onClick={() => go('/app/wallet')}>Back to wallet</button><Nav /></div> }

const buildCalendarDays = () => Array.from({ length: 5 }, (_, index) => {
  const date = new Date(Date.now() + index * 86_400_000)
  const parts = new Intl.DateTimeFormat('en-KE', {
    timeZone: 'Africa/Nairobi',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''

  return {
    day: part('weekday'),
    date: part('day'),
    month: part('month'),
    year: part('year'),
    label: new Intl.DateTimeFormat('en-KE', {
      timeZone: 'Africa/Nairobi',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date),
  }
})
const windows = [{ name: 'Morning', time: '08:00 - 12:00' }, { name: 'Afternoon', time: '12:00 - 16:00' }, { name: 'Evening', time: '16:00 - 20:00' }, { name: 'Custom', time: 'SELECT RANGE' }]
function Schedule() {
  const [days] = useState(buildCalendarDays)
  const [day, setDay] = useState(1), [windowIndex, setWindowIndex] = useState(0)
  const [customStart, setCustomStart] = useState('09:00'), [customEnd, setCustomEnd] = useState('11:00')
  const monthHeading = [...new Set(days.map((item) => `${item.month} ${item.year}`))].join(' – ')
  const customSelected = windows[windowIndex].name === 'Custom'
  const customValid = customStart < customEnd
  const selectedTime = customSelected ? `${customStart} - ${customEnd}` : windows[windowIndex].time
  const schedule = () => { if (customSelected && !customValid) return; sessionStorage.setItem('wallet-schedule', JSON.stringify({ date: days[day].label, time: selectedTime })); go('/app/wallet/scheduled') }
  return <div className="wallet-screen schedule-screen"><Header title="Schedule Transfer" back={() => go('/app/wallet')} /><main><h2>Schedule withdrawal</h2><p>Select a date and window to ensure secure cash-out availability.</p><h3>Select Date <small className="calendar-month">{monthHeading}</small></h3><div className="day-picker">{days.map((item, index) => <button className={day === index ? 'active' : ''} onClick={() => setDay(index)} aria-label={item.label} key={item.label}><span>{item.day}</span><strong>{item.date}</strong><small>{item.month}</small></button>)}</div><h3>Select Time Window</h3><div className="window-picker">{windows.map((item, index) => <button className={windowIndex === index ? 'active' : ''} onClick={() => setWindowIndex(index)} key={item.name}><strong>{item.name}</strong><small>{item.time}</small>{windowIndex === index && <Icon name="check" />}</button>)}</div>{customSelected && <fieldset className="custom-time"><legend>Custom time range</legend><label>From<input type="time" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></label><span aria-hidden="true">–</span><label>To<input type="time" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></label>{!customValid && <p role="alert">End time must be later than start time.</p>}</fieldset>}<aside><Icon name="shield" /><span>Choose a time when it’s safe for an M-Pesa SMS to arrive.</span></aside></main><button className="wallet-primary" disabled={customSelected && !customValid} onClick={schedule}>Schedule</button><Nav /></div>
}
function Scheduled() { const fallbackDate = buildCalendarDays()[1].label; const data = JSON.parse(sessionStorage.getItem('wallet-schedule') || `{"date":"${fallbackDate}","time":"08:00 - 12:00"}`) as { date: string; time: string }; return <div className="wallet-screen status-wallet"><Header title="Withdrawal" /><main><span className="success-check"><Icon name="check" size={44} /></span><h2>Scheduled Successfully</h2><p>Test withdrawal scheduled for {data.date}, {data.time}</p><section className="scheduled-summary"><span>Amount <b>KES 1,000.00</b></span><span>M-Pesa Fee <b>KES 15.00</b></span><span>Recipient Phone <b>•••• 678</b></span></section></main><button className="wallet-primary" onClick={() => go('/app/wallet')}>Back to wallet</button><Nav /></div> }

export default function Wallet() {
  const path = window.location.pathname
  if (path.endsWith('/withdraw')) return <Withdraw />
  if (path.endsWith('/confirm')) return <Confirm />
  if (path.endsWith('/sent')) return <Sent />
  if (path.endsWith('/schedule')) return <Schedule />
  if (path.endsWith('/scheduled')) return <Scheduled />
  return <WalletHome />
}
