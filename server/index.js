const express = require('express')
const dotenv = require('dotenv')
const nodeFetch = require('node-fetch')

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5175

const RIOT_API_KEY = process.env.RIOT_API_KEY || process.env.VITE_RIOT_API_KEY

if (!RIOT_API_KEY) {
  console.warn('Brak RIOT_API_KEY w .env')
}

process.on('unhandledRejection', (err) => {
  console.error('[UNHANDLED_REJECTION]', err)
})

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT_EXCEPTION]', err)
})

app.use((req, res, next) => {
  const keyStatus = RIOT_API_KEY ? 'present' : 'missing'
  console.log(`[REQ] ${req.method} ${req.url} | RIOT_API_KEY=${keyStatus}`)
  next()
})

function riotHeaders() {
  if (!RIOT_API_KEY) {
    const err = new Error('Brak RIOT_API_KEY w .env')
    err.status = 500
    throw err
  }
  return {
    'X-Riot-Token': RIOT_API_KEY,
  }
}

const fetchFn = globalThis.fetch ? globalThis.fetch.bind(globalThis) : nodeFetch

async function riotFetch(url) {
  const res = await fetchFn(url, { headers: riotHeaders() })
  if (!res.ok) {
    const text = await res.text()
    const error = new Error(`HTTP ${res.status}: ${text}`)
    error.status = res.status
    throw error
  }
  return res.json()
}

function sendError(res, err) {
  const status = err.status || 500
  const message = err.message || 'Server error'
  console.error('[RIOT_PROXY_ERROR]', status, message)
  res.status(status).json({ error: message, status })
}

app.get('/api/riot/account/by-riot-id', async (req, res) => {
  try {
    const { gameName, tagLine, routing = 'europe' } = req.query
    if (!gameName || !tagLine) {
      return res.status(400).json({ error: 'Missing gameName or tagLine' })
    }
    const url = `https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`
    const data = await riotFetch(url)
    res.json(data)
  } catch (err) {
    sendError(res, err)
  }
})

app.get('/api/riot/active-shards', async (req, res) => {
  try {
    const { puuid, routing = 'europe' } = req.query
    if (!puuid) {
      return res.status(400).json({ error: 'Missing puuid' })
    }
    const url = `https://${routing}.api.riotgames.com/riot/account/v1/active-shards/by-game/lol/by-puuid/${puuid}`
    const data = await riotFetch(url)
    res.json(data)
  } catch (err) {
    sendError(res, err)
  }
})

app.get('/api/riot/summoner/by-puuid', async (req, res) => {
  try {
    const { puuid, platform } = req.query
    if (!puuid || !platform) {
      return res.status(400).json({ error: 'Missing puuid or platform' })
    }
    const url = `https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`
    const data = await riotFetch(url)
    res.json(data)
  } catch (err) {
    sendError(res, err)
  }
})

app.get('/api/riot/league/by-summoner', async (req, res) => {
  try {
    const { summonerId, platform } = req.query
    if (!summonerId || !platform) {
      return res.status(400).json({ error: 'Missing summonerId or platform' })
    }
    const url = `https://${platform}.api.riotgames.com/lol/league/v4/entries/by-summoner/${summonerId}`
    const data = await riotFetch(url)
    res.json(data)
  } catch (err) {
    sendError(res, err)
  }
})

app.get('/api/riot/matches/by-puuid', async (req, res) => {
  try {
    const { puuid, routing = 'europe', count = '10' } = req.query
    if (!puuid) {
      return res.status(400).json({ error: 'Missing puuid' })
    }
    const url = `https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${encodeURIComponent(count)}`
    const data = await riotFetch(url)
    res.json(data)
  } catch (err) {
    sendError(res, err)
  }
})

app.get('/api/health', (req, res) => {
  res.json({ ok: true })
})

app.listen(PORT, () => {
  console.log(`Riot proxy running on http://localhost:${PORT}`)
})
