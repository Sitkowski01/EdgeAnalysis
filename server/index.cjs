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

// Prosty cache dla meczów (żeby uniknąć rate limit)
const matchCache = new Map()
const CACHE_TTL = 5 * 60 * 1000 // 5 minut

// Rate limiting - kolejka requestów
let lastRequestTime = 0
const MIN_REQUEST_INTERVAL = 50 // 50ms między requestami (20 req/s)

async function rateLimitedFetch(url, headers) {
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequestTime
  
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest))
  }
  
  lastRequestTime = Date.now()
  return fetchFn(url, { headers })
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
  const res = await rateLimitedFetch(url, riotHeaders())
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
    const platformLower = platform.toLowerCase()
    const url = `https://${platformLower}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`
    console.log(`[SUMMONER] Fetching: ${url}`)
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
    const platformLower = platform.toLowerCase()
    const url = `https://${platformLower}.api.riotgames.com/lol/league/v4/entries/by-summoner/${summonerId}`
    const data = await riotFetch(url)
    res.json(data)
  } catch (err) {
    sendError(res, err)
  }
})

// Nowy endpoint league by PUUID
app.get('/api/riot/league/by-puuid', async (req, res) => {
  try {
    const { puuid, platform } = req.query
    if (!puuid || !platform) {
      return res.status(400).json({ error: 'Missing puuid or platform' })
    }
    const platformLower = platform.toLowerCase()
    const url = `https://${platformLower}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`
    console.log(`[LEAGUE] Fetching: ${url}`)
    const data = await riotFetch(url)
    res.json(data)
  } catch (err) {
    sendError(res, err)
  }
})

app.get('/api/riot/matches/by-puuid', async (req, res) => {
  try {
    const { puuid, routing = 'europe', count = '10', start = '0', type = '' } = req.query
    if (!puuid) {
      return res.status(400).json({ error: 'Missing puuid' })
    }
    let url = `https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=${encodeURIComponent(start)}&count=${encodeURIComponent(count)}`
    if (type) {
      url += `&type=${encodeURIComponent(type)}`
    }
    console.log(`[MATCHES] Fetching: ${url}`)
    const data = await riotFetch(url)
    res.json(data)
  } catch (err) {
    sendError(res, err)
  }
})

app.get('/api/riot/match/:matchId', async (req, res) => {
  try {
    const { matchId } = req.params
    const { routing = 'europe' } = req.query
    if (!matchId) {
      return res.status(400).json({ error: 'Missing matchId' })
    }
    
    // Sprawdź cache
    const cacheKey = `${matchId}_${routing}`
    const cached = matchCache.get(cacheKey)
    if (cached && Date.now() - cached.time < CACHE_TTL) {
      console.log(`[MATCH] Cache hit: ${matchId}`)
      return res.json(cached.data)
    }
    
    const url = `https://${routing}.api.riotgames.com/lol/match/v5/matches/${matchId}`
    console.log(`[MATCH] Fetching: ${url}`)
    const data = await riotFetch(url)
    
    // Zapisz do cache
    matchCache.set(cacheKey, { data, time: Date.now() })
    
    res.json(data)
  } catch (err) {
    sendError(res, err)
  }
})

// Champion Mastery endpoint - pobiera wszystkie masteries
app.get('/api/riot/champion-mastery/all', async (req, res) => {
  try {
    const { puuid, platform } = req.query
    if (!puuid || !platform) {
      return res.status(400).json({ error: 'Missing puuid or platform' })
    }
    const platformLower = platform.toLowerCase()
    const url = `https://${platformLower}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}`
    console.log(`[MASTERY] Fetching all: ${url}`)
    const data = await riotFetch(url)
    console.log(`[MASTERY] Got ${data.length} entries`)
    res.json(data)
  } catch (err) {
    sendError(res, err)
  }
})

// Champion Mastery top endpoint
app.get('/api/riot/champion-mastery/top', async (req, res) => {
  try {
    const { puuid, platform, count = '10' } = req.query
    if (!puuid || !platform) {
      return res.status(400).json({ error: 'Missing puuid or platform' })
    }
    const platformLower = platform.toLowerCase()
    const url = `https://${platformLower}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/top?count=${count}`
    console.log(`[MASTERY] Fetching top: ${url}`)
    const data = await riotFetch(url)
    console.log(`[MASTERY] Got ${data.length} top entries`)
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
