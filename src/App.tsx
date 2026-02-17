import React, { useEffect, useState, useMemo } from 'react'

const ThemeContext = React.createContext({theme:'dark', toggle:()=>{}})

function useTheme(){
  const [theme,setTheme] = useState<'light'|'dark'>(() => {
    try{
      const stored = localStorage.getItem('ea-theme')
      return (stored === 'light' || stored === 'dark') ? stored : 'dark'
    }catch(e){
      return 'dark'
    }
  })
  useEffect(()=>{
    document.documentElement.setAttribute('data-theme', theme)
    try{ localStorage.setItem('ea-theme', theme) }catch(e){}
  },[theme])
  return {theme,toggle:()=>setTheme(t => t === 'dark' ? 'light' : 'dark')}
}

type Account = {
  puuid: string
  gameName: string
  tagLine: string
}

type ActiveShard = {
  game: string
  region: string
  platform: string
}

type Summoner = {
  id: string
  puuid: string
  name: string
  summonerLevel: number
  profileIconId: number
}

type LeagueEntry = {
  queueType: string
  tier: string
  rank: string
  leaguePoints: number
  wins: number
  losses: number
}

type SearchResult = {
  account: Account
  shard: ActiveShard
  summoner: Summoner
  leagues: LeagueEntry[]
  matchIds: string[]
  masteries: ChampionMastery[]
}

type ChampionMastery = {
  championId: number
  championLevel: number
  championPoints: number
}

async function riotFetch<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  return res.json()
}

// Mapowanie platform na routing
const getRouting = (p: string) => {
  if (['EUN1', 'EUW1', 'TR1', 'RU'].includes(p)) return 'europe'
  if (['NA1', 'BR1', 'LA1', 'LA2', 'OC1'].includes(p)) return 'americas'
  return 'asia'
}

export default function App(){
  const theme = useTheme()
  const [currentView, setCurrentView] = useState<'home' | 'profile'>('home')
  const [profileData, setProfileData] = useState<SearchResult | null>(null)

  const goToProfile = (data: SearchResult) => {
    setProfileData(data)
    setCurrentView('profile')
  }

  const goHome = () => {
    setCurrentView('home')
    setProfileData(null)
  }

  return (
    <ThemeContext.Provider value={theme}>
      <div className="page">
        {currentView === 'home' && <Header onLogoClick={goHome} />}
        {currentView === 'home' && <HomePage onProfileFound={goToProfile} />}
        {currentView === 'profile' && profileData && <ProfilePage data={profileData} onLogoClick={goHome} />}
      </div>
    </ThemeContext.Provider>
  )
}

function Header({ onLogoClick }: { onLogoClick: () => void }){
  const ctx = React.useContext(ThemeContext)
  return (
    <header className="site-header">
      <div className="header-row">
        <div className="logo" onClick={onLogoClick} style={{cursor:'pointer'}}>⚔ EdgeAnalysis</div>
        <button className="login-btn" onClick={ctx.toggle}>Zaloguj się ▾</button>
      </div>
    </header>
  )
}

function HomePage({ onProfileFound }: { onProfileFound: (data: SearchResult) => void }){
  const [riotId, setRiotId] = useState('')
  const [platform, setPlatform] = useState<'EUN1'|'EUW1'|'NA1'|'KR'|'BR1'|'LA1'|'LA2'|'OC1'|'TR1'|'RU'>('EUN1')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const [gameNameRaw, tagLineRaw] = riotId.split('#')
    const gameName = gameNameRaw?.trim()
    const tagLine = tagLineRaw?.trim()

    if (!gameName || !tagLine) {
      setError('Wpisz Riot ID w formacie Nick#TAG')
      return
    }

    const routing = getRouting(platform)

    setLoading(true)
    try {
      const account = await riotFetch<Account>(
        `/api/riot/account/by-riot-id?gameName=${encodeURIComponent(gameName)}&tagLine=${encodeURIComponent(tagLine)}&routing=${routing}`
      )

      let summoner: Summoner | null = null
      try {
        summoner = await riotFetch<Summoner>(
          `/api/riot/summoner/by-puuid?puuid=${account.puuid}&platform=${platform}`
        )
        console.log('Summoner found:', summoner)
      } catch (err) {
        console.log('Brak summonera na tej platformie:', err)
      }

      // Pobierz rangi używając PUUID (nowy endpoint)
      let leagues: LeagueEntry[] = []
      try {
        console.log('Fetching leagues for puuid:', account.puuid)
        leagues = await riotFetch<LeagueEntry[]>(
          `/api/riot/league/by-puuid?puuid=${account.puuid}&platform=${platform}`
        )
        console.log('Leagues found:', leagues)
      } catch (err) {
        console.log('Error fetching leagues:', err)
        leagues = []
      }

      // Pobierz gry rankingowe (50 dla szybkości)
      let matchIds: string[] = []
      try {
        matchIds = await riotFetch<string[]>(
          `/api/riot/matches/by-puuid?puuid=${account.puuid}&routing=${routing}&count=50&type=ranked`
        )
        console.log(`Fetched ${matchIds.length} ranked matches`)
      } catch (err) {
        console.log('Error fetching matches:', err)
        matchIds = []
      }

      // Pobierz wszystkie mastery (posortowane po punktach)
      let masteries: ChampionMastery[] = []
      try {
        masteries = await riotFetch<ChampionMastery[]>(
          `/api/riot/champion-mastery/all?puuid=${account.puuid}&platform=${platform}`
        )
        console.log('Masteries fetched:', masteries.length, 'top 3:', masteries.slice(0, 3))
      } catch (err) {
        console.log('Error fetching masteries:', err)
        masteries = []
      }

      const shardResult: ActiveShard = {
        game: 'lol',
        region: routing,
        platform: platform,
      }
      
      const result: SearchResult = { 
        account, 
        shard: shardResult, 
        summoner: summoner || { id: '', puuid: account.puuid, name: account.gameName, summonerLevel: 0, profileIconId: 0 }, 
        leagues, 
        matchIds,
        masteries
      }

      onProfileFound(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nieznany błąd')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="hero">
      <h1>Nie liczymy winów.<br/>Liczymy decyzje.</h1>
      <p className="lead">Zrozum, co decyduje o jakości twojej gry<br/>w League of Legends dzięki zaawansowanej analizie<br/>każdego meczu.</p>

      <form className="search-box" onSubmit={onSearch}>
        <select value={platform} onChange={e => setPlatform(e.target.value as typeof platform)}>
          <option value="EUN1">EUNE</option>
          <option value="EUW1">EUW</option>
          <option value="NA1">NA</option>
          <option value="KR">KR</option>
          <option value="BR1">BR</option>
          <option value="LA1">LAN</option>
          <option value="LA2">LAS</option>
          <option value="OC1">OCE</option>
          <option value="TR1">TR</option>
          <option value="RU">RU</option>
        </select>
        <input
          placeholder="Nick#TAG"
          value={riotId}
          onChange={e => setRiotId(e.target.value)}
        />
        <button type="submit" disabled={loading}>{loading ? 'Szukam...' : 'Szukaj'}</button>
      </form>

      {error && <div className="result error">{error}</div>}

      <div className="check-row">
        <span className="dot"></span>
        <span>Sprawdź dowolnego gracza bez logowania</span>
        <span className="arrow">▸</span>
      </div>

      <h2 className="section-title">Jak to działa?</h2>
      <p className="section-desc">Połącz konto LoL, a my przeanalizujemy Twoje mecze i pokażemy,<br/>co naprawdę ma wpływ.</p>

      <div className="card">
        <div className="card-icon">📊</div>
        <div className="card-content">
          <h3>Analiza meczu, która naprawdę uczy.</h3>
          <p>Logowanie przez Riot ID pozwala nam pobrać historię gier<br/>i obliczyć Twój Impact.</p>
          <button className="btn gold">🔒 Zaloguj się przez Riot ID ▸</button>
        </div>
      </div>

      <div className="card">
        <div className="card-icon">🎮</div>
        <div className="card-content">
          <h3>Połącz swoje konto LoL</h3>
          <p>Logowanie przez Riot ID pozwala nam pobrać historię<br/>gier i obliczyć Twój Impact.</p>
          <button className="btn gold-outline">🔒 Zaloguj się przez Riot ID ▸</button>
        </div>
      </div>
    </main>
  )
}

// Typy dla analizy meczów
type MatchParticipant = {
  puuid: string
  championName: string
  championId: number
  champLevel: number
  kills: number
  deaths: number
  assists: number
  win: boolean
  totalMinionsKilled: number
  neutralMinionsKilled: number
  visionScore: number
  visionWardsBoughtInGame: number
  wardsPlaced: number
  wardsKilled: number
  goldEarned: number
  totalDamageDealtToChampions: number
  totalDamageTaken: number
  teamPosition: string
  gameDuration: number
  teamId: number
  riotIdGameName?: string
  riotIdTagline?: string
  summonerName?: string
  item0: number
  item1: number
  item2: number
  item3: number
  item4: number
  item5: number
  item6: number
  summoner1Id: number
  summoner2Id: number
  doubleKills: number
  tripleKills: number
  quadraKills: number
  pentaKills: number
  // === Map objectives & events ===
  turretKills: number
  inhibitorKills: number
  dragonKills: number
  baronKills: number
  firstBloodKill: boolean
  firstBloodAssist: boolean
  firstTowerKill: boolean
  firstTowerAssist: boolean
  objectivesStolen: number
  objectivesStolenAssists: number
  damageDealtToObjectives: number
  damageDealtToTurrets: number
  damageDealtToBuildings: number
  // === Utility & team contribution ===
  timeCCingOthers: number
  totalTimeCCDealt: number
  totalHeal: number
  totalHealsOnTeammates: number
  totalDamageShieldedOnTeammates: number
  // === Survivability ===
  longestTimeSpentLiving: number
  // === Solo performance ===
  soloKills: number
  largestKillingSpree: number
  killingSprees: number
}

type MatchData = {
  info: {
    gameDuration: number
    participants: MatchParticipant[]
    queueId: number
    gameCreation: number
    teams: { teamId: number; win: boolean; objectives: { baron: { kills: number }; dragon: { kills: number }; tower: { kills: number } } }[]
  }
}

type ChampionStats = {
  name: string
  games: number
  wins: number
  kills: number
  deaths: number
  assists: number
  totalImpact: number
}

type LaneStats = {
  games: number
  wins: number
}

// Polska odmiana słowa "gra"
function pluralGry(n: number): string {
  if (n === 1) return 'gra'
  const lastDigit = n % 10
  const lastTwoDigits = n % 100
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return 'gier'
  if (lastDigit >= 2 && lastDigit <= 4) return 'gry'
  return 'gier'
}

// Oblicz Impact Score dla pojedynczego meczu (0-10)
function calculateMatchImpact(p: MatchParticipant, gameDuration: number): number {
  const minutes = gameDuration / 60
  if (minutes <= 0) return 0
  
  // KDA component (0-2.5 pts)
  const kda = p.deaths === 0 ? (p.kills + p.assists) : (p.kills + p.assists) / p.deaths
  const kdaScore = Math.min(kda / 3, 2.5)
  
  // CS per minute (0-1.5 pts)
  const csPerMin = (p.totalMinionsKilled + (p.neutralMinionsKilled || 0)) / minutes
  const csScore = Math.min(csPerMin / 7, 1.5)
  
  // Vision per minute (0-1 pt)
  const visionPerMin = (p.visionScore || 0) / minutes
  const visionScore = Math.min(visionPerMin / 1.5, 1)
  
  // Damage per minute (0-1.5 pts)
  const dmgPerMin = (p.totalDamageDealtToChampions || 0) / minutes
  const dmgScore = Math.min(dmgPerMin / 800, 1.5)
  
  // Gold efficiency (0-1 pt)
  const goldPerMin = (p.goldEarned || 0) / minutes
  const goldScore = Math.min(goldPerMin / 450, 1)
  
  // === MAP IMPACT (0-2.5 pts total) ===
  // Objective kills: turrets, inhibs, dragons, barons
  const objKills = (p.turretKills || 0) * 0.3 + (p.inhibitorKills || 0) * 0.5 + (p.dragonKills || 0) * 0.6 + (p.baronKills || 0) * 1.0
  const objScore = Math.min(objKills, 1.5)
  
  // Objective damage contribution
  const objDmgPerMin = (p.damageDealtToObjectives || 0) / minutes
  const objDmgScore = Math.min(objDmgPerMin / 600, 1)
  
  // Win bonus (0 or 1)
  const winBonus = p.win ? 1 : 0
  
  // Penalties
  const deathPenalty = Math.min((p.deaths / minutes) * 0.8, 2)
  
  const total = kdaScore + csScore + visionScore + dmgScore + goldScore + objScore + objDmgScore + winBonus - deathPenalty
  return Math.min(Math.max(total, 0), 10)
}

// ============================================================
// RANKING SYSTEM — EdgeScore™ — ocena wszystkich 10 graczy
// Bierzemy pod uwagę: statystyki, obiektywy mapowe, CC, heal/shield,
// first blood, solo kills, kille spree, steal obieektywów,
// i jak bardzo przyczynił się do wygrania meczu.
// ============================================================
type PlayerScore = {
  rank: number
  score: number
  breakdown: {
    combat: number      // KDA + multi kills + solo kills + sprees
    damage: number      // DMG share + DPM
    objectives: number  // Turrets, inhibs, dragons, barons, obj DMG, steals
    economy: number     // Gold, CS
    vision: number      // Vision score, wards
    utility: number     // CC, heals, shields, tanking
    clutch: number      // First blood, first tower, objective steals, survivability
    impact: number      // Nasz autorski Impact Score — ogólna ocena wydajności
    winContribution: number // How much you drove the win
  }
}

function rankPlayersInMatch(
  participants: MatchParticipant[],
  gameDuration: number,
  teams?: MatchData['info']['teams']
): Map<string, PlayerScore> {
  const minutes = gameDuration / 60
  if (minutes <= 0) return new Map()

  // ═══════════════════════════════════════════════
  // ROLE WEIGHTS — każda linia oceniana inaczej
  // Wagi 0.75–1.25: wyraźne różnice, ale bez
  // ekstremalnych kar. Każda rola może zdobyć 100.
  //
  // Top:  walka 1v1, tanking, wieże, CS
  // Jng:  obiektywy, clutch (ganki, steale), wizja
  // Mid:  damage, walka, roaming/clutch
  // ADC:  damage, ekonomia, carry potential
  // Sup:  wizja, utility (CC, heal, shield), playmaking
  // ═══════════════════════════════════════════════
  const roleWeights: Record<string, Record<string, number>> = {
    //            combat  dmg    obj    eco    vis    util   clutch impact win
    TOP:     { combat: 1.15, damage: 1.00, objectives: 1.10, economy: 1.00, vision: 0.85, utility: 1.15, clutch: 0.95, impact: 1.00, winContribution: 1.00 },
    JUNGLE:  { combat: 1.00, damage: 0.90, objectives: 1.20, economy: 0.85, vision: 1.10, utility: 0.95, clutch: 1.15, impact: 1.00, winContribution: 1.00 },
    MIDDLE:  { combat: 1.10, damage: 1.15, objectives: 0.95, economy: 1.00, vision: 0.85, utility: 0.85, clutch: 1.10, impact: 1.00, winContribution: 1.00 },
    BOTTOM:  { combat: 1.00, damage: 1.10, objectives: 0.95, economy: 1.05, vision: 0.85, utility: 0.85, clutch: 0.95, impact: 1.00, winContribution: 1.00 },
    UTILITY: { combat: 0.95, damage: 0.80, objectives: 0.90, economy: 0.85, vision: 1.15, utility: 1.15, clutch: 1.05, impact: 1.00, winContribution: 1.00 },
    DEFAULT: { combat: 1.00, damage: 1.00, objectives: 1.00, economy: 1.00, vision: 1.00, utility: 1.00, clutch: 1.00, impact: 1.00, winContribution: 1.00 },
  }
  const categoryMax: Record<string, number> = {
    combat: 25, damage: 18, objectives: 20, economy: 10,
    vision: 8, utility: 12, clutch: 12, impact: 10, winContribution: 10
  }

  // ——— Aggregate totals for relative scoring ———
  const totalKills = Math.max(participants.reduce((s, p) => s + p.kills, 0), 1)
  const totalDmg = Math.max(participants.reduce((s, p) => s + (p.totalDamageDealtToChampions || 0), 0), 1)
  const totalGold = Math.max(participants.reduce((s, p) => s + (p.goldEarned || 0), 0), 1)
  const totalVision = Math.max(participants.reduce((s, p) => s + (p.visionScore || 0), 0), 1)
  const totalDmgTaken = Math.max(participants.reduce((s, p) => s + (p.totalDamageTaken || 0), 0), 1)
  const totalObjDmg = Math.max(participants.reduce((s, p) => s + (p.damageDealtToObjectives || 0), 0), 1)
  const totalCC = Math.max(participants.reduce((s, p) => s + (p.timeCCingOthers || 0), 0), 1)
  const totalHealing = Math.max(participants.reduce((s, p) => s + (p.totalHealsOnTeammates || 0) + (p.totalDamageShieldedOnTeammates || 0), 0), 1)

  // Per-team stats
  const teamKills: Record<number, number> = {}
  const teamGold: Record<number, number> = {}
  const teamDmg: Record<number, number> = {}
  participants.forEach(p => {
    teamKills[p.teamId] = (teamKills[p.teamId] || 0) + p.kills
    teamGold[p.teamId] = (teamGold[p.teamId] || 0) + (p.goldEarned || 0)
    teamDmg[p.teamId] = (teamDmg[p.teamId] || 0) + (p.totalDamageDealtToChampions || 0)
  })

  // Team objective data
  const teamObjectives: Record<number, { barons: number; dragons: number; towers: number }> = {}
  if (teams) {
    teams.forEach(t => {
      teamObjectives[t.teamId] = {
        barons: t.objectives?.baron?.kills || 0,
        dragons: t.objectives?.dragon?.kills || 0,
        towers: t.objectives?.tower?.kills || 0
      }
    })
  }

  const scored = participants.map(p => {
    const kda = p.deaths === 0 ? (p.kills + p.assists) * 1.5 : (p.kills + p.assists) / p.deaths
    const cs = p.totalMinionsKilled + (p.neutralMinionsKilled || 0)
    const myTeamKills = Math.max(teamKills[p.teamId] || 1, 1)
    const myTeamGold = Math.max(teamGold[p.teamId] || 1, 1)
    const myTeamDmg = Math.max(teamDmg[p.teamId] || 1, 1)
    const killParticipation = (p.kills + p.assists) / myTeamKills

    // ═══════════════════════════════════════════════
    // 1) COMBAT (max ~25 pts) — KDA, multi-kills, solo kills, sprees
    // ═══════════════════════════════════════════════
    const kdaPts = Math.min(kda / 5, 1) * 12
    const kpPts = Math.min(killParticipation, 1) * 6
    const multiKillPts = Math.min(
      (p.doubleKills || 0) * 0.5 +
      (p.tripleKills || 0) * 1.5 +
      (p.quadraKills || 0) * 3 +
      (p.pentaKills || 0) * 7, 7
    )
    const soloPts = Math.min((p.soloKills || 0) * 1.2, 4)  // outplaying opponents 1v1
    const spreePts = Math.min((p.largestKillingSpree || 0) * 0.3, 3) // domination
    const deathPenalty = Math.min((p.deaths / minutes) * 2.5, 7)
    const combat = Math.max(kdaPts + kpPts + multiKillPts + soloPts + spreePts - deathPenalty, 0)

    // ═══════════════════════════════════════════════
    // 2) DAMAGE (max ~18 pts) — share of total + DPM
    // ═══════════════════════════════════════════════
    const dmgSharePts = Math.min((p.totalDamageDealtToChampions || 0) / totalDmg / 0.15, 1) * 10
    const dpmPts = Math.min((p.totalDamageDealtToChampions || 0) / minutes / 700, 1) * 5
    const teamDmgSharePts = Math.min((p.totalDamageDealtToChampions || 0) / myTeamDmg / 0.25, 1) * 3
    const damage = dmgSharePts + dpmPts + teamDmgSharePts

    // ═══════════════════════════════════════════════
    // 3) OBJECTIVES (max ~20 pts) — the BIG differentiator
    // Turrets, inhibitors, dragons, barons, obj damage, steals
    // ═══════════════════════════════════════════════
    const turretPts = Math.min((p.turretKills || 0) * 1.5, 4)
    const inhibPts = Math.min((p.inhibitorKills || 0) * 2, 3)
    const dragonPts = Math.min((p.dragonKills || 0) * 1.5, 3)
    const baronPts = Math.min((p.baronKills || 0) * 2.5, 3)
    const objDmgShare = (p.damageDealtToObjectives || 0) / totalObjDmg
    const objDmgPts = Math.min(objDmgShare / 0.15, 1) * 4
    const stealPts = ((p.objectivesStolen || 0) + (p.objectivesStolenAssists || 0) * 0.5) * 3
    const stealCapped = Math.min(stealPts, 5) // smite steals are huge
    const objectives = turretPts + inhibPts + dragonPts + baronPts + objDmgPts + stealCapped

    // ═══════════════════════════════════════════════
    // 4) ECONOMY (max ~10 pts) — gold, CS
    // ═══════════════════════════════════════════════
    const goldSharePts = Math.min((p.goldEarned || 0) / totalGold / 0.12, 1) * 5
    const csPerMin = cs / minutes
    const csPts = Math.min(csPerMin / 8, 1) * 3
    const goldEfficiency = myTeamGold > 0 ? (p.goldEarned || 0) / myTeamGold : 0
    const goldEffPts = Math.min(goldEfficiency / 0.25, 1) * 2
    const economy = goldSharePts + csPts + goldEffPts

    // ═══════════════════════════════════════════════
    // 5) VISION (max ~8 pts) — score, wards placed/killed
    // ═══════════════════════════════════════════════
    const visionSharePts = Math.min((p.visionScore || 0) / totalVision / 0.13, 1) * 4
    const wardsPerMinPts = Math.min(((p.wardsPlaced || 0) + (p.wardsKilled || 0)) / minutes / 1.5, 1) * 2
    const controlWardPts = Math.min((p.visionWardsBoughtInGame || 0) * 0.5, 2)
    const vision = visionSharePts + wardsPerMinPts + controlWardPts

    // ═══════════════════════════════════════════════
    // 6) UTILITY (max ~12 pts) — CC, heals, shields, tanking
    // ═══════════════════════════════════════════════
    const ccShare = (p.timeCCingOthers || 0) / totalCC
    const ccPts = Math.min(ccShare / 0.15, 1) * 4
    const healShieldShare = ((p.totalHealsOnTeammates || 0) + (p.totalDamageShieldedOnTeammates || 0)) / totalHealing
    const healShieldPts = Math.min(healShieldShare / 0.15, 1) * 4
    const tankShare = (p.totalDamageTaken || 0) / totalDmgTaken
    const tankPts = Math.min(tankShare / 0.15, 1) * 4
    const utility = ccPts + healShieldPts + tankPts

    // ═══════════════════════════════════════════════
    // 7) CLUTCH / MAP PRESSURE (max ~12 pts)
    // First blood, first tower, steals, surviving, turret DMG
    // ═══════════════════════════════════════════════
    const firstBloodPts = (p.firstBloodKill ? 2 : 0) + (p.firstBloodAssist ? 1 : 0)
    const firstTowerPts = (p.firstTowerKill ? 2 : 0) + (p.firstTowerAssist ? 1 : 0)
    const towerDmgPts = Math.min((p.damageDealtToTurrets || p.damageDealtToBuildings || 0) / minutes / 200, 1) * 3
    const survivalPts = Math.min((p.longestTimeSpentLiving || 0) / (gameDuration * 0.4), 1) * 2
    const levelAdvPts = Math.min(p.champLevel / 18, 1) * 2 // high level = consistent presence
    const clutch = Math.min(firstBloodPts + firstTowerPts + towerDmgPts + survivalPts + levelAdvPts, 12)

    // ═══════════════════════════════════════════════
    // 8) WIN CONTRIBUTION (max ~10 pts)
    // How much of your team's output was YOU?
    // ═══════════════════════════════════════════════
    const teamKillShare = (p.kills + p.assists) / (myTeamKills + 1) // KP as win driver
    const teamGoldShare = (p.goldEarned || 0) / myTeamGold
    const teamDmgPct = (p.totalDamageDealtToChampions || 0) / myTeamDmg
    // Weighted average of how much you carried for the team
    const carryIndex = teamKillShare * 0.35 + teamDmgPct * 0.35 + teamGoldShare * 0.3
    const winMultiplier = p.win ? 1.5 : 0.7 // winners get bonus, losers diminished
    const winContribution = Math.min(carryIndex * winMultiplier * 15, 10)

    // ═══════════════════════════════════════════════
    // 9) IMPACT — nasz autorski wskaźnik (max ~10 pts)
    // Bierze pod uwagę ogólną wydajność gracza: KDA, CS/min,
    // wizję, DMG/min, złoto, obiektywy mapowe — niezależnie
    // od reszty kategorii. Działa jak "bonus za wszechstronność".
    // ═══════════════════════════════════════════════
    const impactRaw = calculateMatchImpact(p, gameDuration)
    // Impact 0-10 → scale to 0-10 pts in EdgeScore
    const impact = impactRaw

    // ═══════════════════════════════════════════════
    // TOTAL — apply ROLE WEIGHTS, normalize per-role
    // Każda linia ma inne wagi, żeby support nie był
    // karany za brak DMG, a jungler za niski CS.
    // ═══════════════════════════════════════════════
    const w = roleWeights[p.teamPosition] || roleWeights.DEFAULT
    const rawWeighted =
      combat * w.combat +
      damage * w.damage +
      objectives * w.objectives +
      economy * w.economy +
      vision * w.vision +
      utility * w.utility +
      clutch * w.clutch +
      impact * w.impact +
      winContribution * w.winContribution

    // Normalize: role-specific max so every role can reach 100
    const roleMax = Object.keys(categoryMax).reduce(
      (s, k) => s + categoryMax[k] * (w[k] ?? 1), 0
    )
    const normalized = Math.min(rawWeighted / roleMax * 100, 100)

    return {
      puuid: p.puuid,
      score: normalized,
      breakdown: { combat, damage, objectives, economy, vision, utility, clutch, impact, winContribution }
    }
  })

  // Sort descending → rank 1 = MVP
  scored.sort((a, b) => b.score - a.score)
  const result = new Map<string, PlayerScore>()
  scored.forEach((s, i) => result.set(s.puuid, {
    rank: i + 1,
    score: s.score,
    breakdown: s.breakdown
  }))
  return result
}

// Mapowanie pozycji na nazwy linii
function normalizePosition(pos: string): string {
  const map: Record<string, string> = {
    'TOP': 'Top',
    'JUNGLE': 'Jng',
    'MIDDLE': 'Mid',
    'BOTTOM': 'Adc',
    'UTILITY': 'Sup',
    '': 'Unknown'
  }
  return map[pos] || 'Unknown'
}

function ProfilePage({ data, onLogoClick }: { data: SearchResult, onLogoClick: () => void }){
  const { account, summoner, leagues, matchIds, shard, masteries } = data
  const routing = shard.region
  
  console.log('ProfilePage masteries:', masteries?.length, masteries?.slice(0, 2))
  
  const [matchesLoading, setMatchesLoading] = useState(true)
  const [matchesData, setMatchesData] = useState<MatchData[]>([])
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [championIdMap, setChampionIdMap] = useState<Record<number, string>>({})
  const [subPage, setSubPage] = useState<'overview' | 'matches'>('overview')
  const [matchFilter, setMatchFilter] = useState<'all' | 'wins' | 'losses'>('all')
  const [expandedMatch, setExpandedMatch] = useState<number | null>(null)
  const [itemNames, setItemNames] = useState<Record<number, string>>({})

  // Pobierz mapowanie championId -> nazwa z Data Dragon + item names
  useEffect(() => {
    const fetchChampions = async () => {
      try {
        const res = await fetch('https://ddragon.leagueoflegends.com/cdn/16.3.1/data/en_US/champion.json')
        const data = await res.json()
        const idMap: Record<number, string> = {}
        for (const champ of Object.values(data.data) as any[]) {
          idMap[parseInt(champ.key)] = champ.id
        }
        setChampionIdMap(idMap)
      } catch (err) {
        console.error('Error fetching champion data:', err)
      }
    }
    const fetchItems = async () => {
      try {
        const res = await fetch('https://ddragon.leagueoflegends.com/cdn/16.3.1/data/en_US/item.json')
        const data = await res.json()
        const names: Record<number, string> = {}
        for (const [id, item] of Object.entries(data.data) as any[]) {
          names[parseInt(id)] = item.name
        }
        setItemNames(names)
      } catch (err) {
        console.error('Error fetching item data:', err)
      }
    }
    fetchChampions()
    fetchItems()
  }, [])

  // Pobierz dane meczów
  useEffect(() => {
    const fetchMatches = async () => {
      setMatchesLoading(true)
      const matches: MatchData[] = []
      
      for (let i = 0; i < matchIds.length; i++) {
        try {
          const match = await riotFetch<MatchData>(
            `/api/riot/match/${matchIds[i]}?routing=${routing}`
          )
          matches.push(match)
          setLoadingProgress(Math.round(((i + 1) / matchIds.length) * 100))
        } catch (err) {
          console.error('Error fetching match:', matchIds[i], err)
        }
        // Mały delay żeby nie przekroczyć rate limit
        await new Promise(r => setTimeout(r, 100))
      }
      
      setMatchesData(matches)
      setMatchesLoading(false)
    }
    
    if (matchIds.length > 0) {
      fetchMatches()
    } else {
      setMatchesLoading(false)
    }
  }, [matchIds, routing])

  // Ostatnie 20 meczów do wyświetlania
  const recentMatches = useMemo(() => matchesData.slice(0, 20), [matchesData])

  // Analizuj OSTATNIE 20 meczów (dla impact, trend, wyświetlania)
  const recentAnalysis = useMemo(() => {
    const recent = recentMatches
    if (recent.length === 0) {
      return {
        impactScores: [] as number[],
        avgImpact: 0,
        winrate: 0,
        wins: 0,
        losses: 0,
        lanes: {} as Record<string, LaneStats>,
        avgKDA: { kills: 0, deaths: 0, assists: 0 },
        recentTrend: 0
      }
    }

    const impactScores: number[] = []
    const lanes: Record<string, LaneStats> = {}
    let totalKills = 0, totalDeaths = 0, totalAssists = 0
    let wins = 0, losses = 0

    for (const match of recent) {
      const participant = match.info.participants.find(p => p.puuid === account.puuid)
      if (!participant) continue

      const impact = calculateMatchImpact(participant, match.info.gameDuration)
      impactScores.push(impact)

      if (participant.win) wins++
      else losses++

      totalKills += participant.kills
      totalDeaths += participant.deaths
      totalAssists += participant.assists

      const lane = normalizePosition(participant.teamPosition)
      if (lane !== 'Unknown') {
        if (!lanes[lane]) lanes[lane] = { games: 0, wins: 0 }
        lanes[lane].games++
        if (participant.win) lanes[lane].wins++
      }
    }

    const totalGames = wins + losses
    const avgImpact = impactScores.length > 0 
      ? impactScores.reduce((a, b) => a + b, 0) / impactScores.length 
      : 0

    const recent5 = impactScores.slice(0, 5)
    const prev5 = impactScores.slice(5, 10)
    const recentAvg = recent5.length > 0 ? recent5.reduce((a,b) => a+b, 0) / recent5.length : 0
    const prevAvg = prev5.length > 0 ? prev5.reduce((a,b) => a+b, 0) / prev5.length : avgImpact
    const recentTrend = recentAvg - prevAvg

    return {
      impactScores,
      avgImpact,
      winrate: totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0,
      wins,
      losses,
      lanes,
      avgKDA: {
        kills: totalGames > 0 ? totalKills / totalGames : 0,
        deaths: totalGames > 0 ? totalDeaths / totalGames : 0,
        assists: totalGames > 0 ? totalAssists / totalGames : 0
      },
      recentTrend
    }
  }, [recentMatches, account.puuid])

  // Analizuj WSZYSTKIE mecze sezonu (dla profilu i championów)
  const seasonAnalysis = useMemo(() => {
    if (matchesData.length === 0) {
      return {
        impactScores: [] as number[],
        avgImpact: 0,
        winrate: 0,
        wins: 0,
        losses: 0,
        lanes: {} as Record<string, LaneStats>,
        champions: {} as Record<string, ChampionStats>,
        avgKDA: { kills: 0, deaths: 0, assists: 0 },
        totalGames: 0
      }
    }

    const impactScores: number[] = []
    const lanes: Record<string, LaneStats> = {}
    const champions: Record<string, ChampionStats> = {}
    let totalKills = 0, totalDeaths = 0, totalAssists = 0
    let wins = 0, losses = 0

    for (const match of matchesData) {
      const participant = match.info.participants.find(p => p.puuid === account.puuid)
      if (!participant) continue

      const impact = calculateMatchImpact(participant, match.info.gameDuration)
      impactScores.push(impact)
      
      // Win/loss
      if (participant.win) wins++
      else losses++

      // KDA
      totalKills += participant.kills
      totalDeaths += participant.deaths
      totalAssists += participant.assists

      // Lane stats
      const lane = normalizePosition(participant.teamPosition)
      if (lane !== 'Unknown') {
        if (!lanes[lane]) lanes[lane] = { games: 0, wins: 0 }
        lanes[lane].games++
        if (participant.win) lanes[lane].wins++
      }

      // Champion stats
      const champ = participant.championName
      if (!champions[champ]) {
        champions[champ] = { name: champ, games: 0, wins: 0, kills: 0, deaths: 0, assists: 0, totalImpact: 0 }
      }
      champions[champ].games++
      if (participant.win) champions[champ].wins++
      champions[champ].kills += participant.kills
      champions[champ].deaths += participant.deaths
      champions[champ].assists += participant.assists
      champions[champ].totalImpact += impact
    }

    const totalGames = wins + losses
    const avgImpact = impactScores.length > 0 
      ? impactScores.reduce((a, b) => a + b, 0) / impactScores.length 
      : 0

    return {
      impactScores,
      avgImpact,
      winrate: totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0,
      wins,
      losses,
      lanes,
      champions,
      avgKDA: {
        kills: totalGames > 0 ? totalKills / totalGames : 0,
        deaths: totalGames > 0 ? totalDeaths / totalGames : 0,
        assists: totalGames > 0 ? totalAssists / totalGames : 0
      },
      totalGames
    }
  }, [matchesData, account.puuid])

  // Alias - profil używa danych z całego sezonu, ale Impact z ostatnich 20
  const analysis = useMemo(() => ({
    ...seasonAnalysis,
    // Impact z ostatnich 20 gier
    impactScores: recentAnalysis.impactScores,
    avgImpact: recentAnalysis.avgImpact,
    recentTrend: recentAnalysis.recentTrend
  }), [recentAnalysis, seasonAnalysis])

  // Znajdź rangę Solo/Duo
  const soloRank = leagues.find(l => l.queueType === 'RANKED_SOLO_5x5')

  const getRankDisplay = (entry: LeagueEntry | undefined) => {
    if (!entry) return { tier: 'Unranked', rank: '', lp: 0, wins: 0, losses: 0, winrate: 0 }
    const total = entry.wins + entry.losses
    const winrate = total > 0 ? Math.round((entry.wins / total) * 100) : 0
    return {
      tier: entry.tier,
      rank: entry.rank,
      lp: entry.leaguePoints,
      wins: entry.wins,
      losses: entry.losses,
      winrate
    }
  }

  const solo = getRankDisplay(soloRank)

  // Ikona profilu z Data Dragon
  const profileIconUrl = `https://ddragon.leagueoflegends.com/cdn/16.3.1/img/profileicon/${summoner.profileIconId}.png`

  // Funkcja do pobierania ikony rangi - używamy Community Dragon
  const getRankIcon = (tier: string) => {
    const tierLower = tier.toLowerCase()
    if (tierLower === 'unranked') {
      return new URL('./assets/master.jpg', import.meta.url).href
    }
    // Używamy ranked emblems z Community Dragon
    return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-${tierLower}.png`
  }
  
  // Tier initial dla fallback
  const getTierInitial = (tier: string) => {
    const initials: Record<string, string> = {
      'IRON': 'I',
      'BRONZE': 'B', 
      'SILVER': 'S',
      'GOLD': 'G',
      'PLATINUM': 'P',
      'EMERALD': 'E',
      'DIAMOND': 'D',
      'MASTER': 'M',
      'GRANDMASTER': 'GM',
      'CHALLENGER': 'C'
    }
    return initials[tier] || '?'
  }
  
  // Mapowanie rang na pliki SVG
  const rankIconMap: Record<string, string> = {
    'iron': new URL('./assets/Iron_najlepszy.svg', import.meta.url).href,
    'bronze': new URL('./assets/Bronze.svg', import.meta.url).href,
    'silver': new URL('./assets/Srebro.svg', import.meta.url).href,
    'gold': new URL('./assets/Gold.svg', import.meta.url).href,
    'platinum': new URL('./assets/Platyna.svg', import.meta.url).href,
    'emerald': new URL('./assets/Emerald.svg', import.meta.url).href,
    'diamond': new URL('./assets/Diament.svg', import.meta.url).href,
    'master': new URL('./assets/Master.svg', import.meta.url).href,
    'grandmaster': new URL('./assets/Grandmaster.svg', import.meta.url).href,
    'challenger': new URL('./assets/Challanger.svg', import.meta.url).href,
  }

  const bannerSvgUrl = new URL('./assets/Banner_master.svg', import.meta.url).href

  const getRankIconUrl = (tier: string): string => {
    return rankIconMap[tier.toLowerCase()] || rankIconMap['iron']
}

  // Przygotuj dane do wyświetlenia - ikony z Community Dragon
  const laneIconUrls: Record<string, string> = {
    'Top': 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-top.png',
    'Jng': 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-jungle.png',
    'Mid': 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-middle.png',
    'Adc': 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-bottom.png',
    'Sup': 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-utility.png'
  }

  // Wszystkie linie - zawsze pokazuj wszystkie 5, nawet z 0 gier
  const allLanes = ['Top', 'Jng', 'Mid', 'Adc', 'Sup']
  
  const lanesData = useMemo(() => {
    console.log('RAW analysis.lanes:', JSON.stringify(analysis.lanes))
    const data = allLanes.map(name => {
      const stats = analysis.lanes[name] || { games: 0, wins: 0 }
      console.log(`Lane ${name}: games=${stats.games}, wins=${stats.wins}`)
      return {
        name,
        iconUrl: laneIconUrls[name],
        winrate: stats.games > 0 ? Math.round((stats.wins / stats.games) * 100) : 0,
        games: stats.games
      }
    })
    return data
  }, [analysis.lanes])

  // Znajdź najlepszą linię (najwyższy winrate z min. 5 gier)
  const bestLane = useMemo(() => {
    const validLanes = lanesData.filter(lane => lane.games >= 5)
    console.log('validLanes for bestLane:', validLanes.map(l => ({name: l.name, wr: l.winrate, games: l.games})))
    if (validLanes.length === 0) return ''
    
    // Sortuj po winrate malejąco, potem po ilości gier
    const sorted = [...validLanes].sort((a, b) => {
      if (b.winrate !== a.winrate) return b.winrate - a.winrate
      return b.games - a.games
    })
    console.log('sorted lanes:', sorted.map(l => `${l.name}:${l.winrate}%`))
    console.log('BEST LANE IS:', sorted[0].name)
    return sorted[0].name
  }, [lanesData])

  // Champion toggle state: 'winrate' | 'games' | 'mastery'
  const [champMode, setChampMode] = useState<'winrate' | 'games' | 'mastery'>('winrate')
  
  // State for expanding long player names
  const [nameExpanded, setNameExpanded] = useState(false)

  // Top 10 championów dla karuzeli - sortowanie wg trybu
  const topChampions = useMemo(() => {
    console.log('topChampions calc - champMode:', champMode, 'masteries:', masteries?.length, 'championIdMap keys:', Object.keys(championIdMap).length)
    
    if (champMode === 'mastery') {
      // Sort by mastery points (from API)
      // Czekaj aż championIdMap się załaduje
      if (Object.keys(championIdMap).length === 0) {
        console.log('championIdMap is empty, waiting...')
        return []
      }
      if (!masteries || masteries.length === 0) {
        console.log('masteries is empty')
        return []
      }
      const mapped = masteries.slice(0, 10).map(m => {
        const champName = championIdMap[m.championId] || 'Unknown'
        console.log('Mapping championId', m.championId, 'to', champName)
        const champStats = analysis.champions[champName]
        const kdaValue = champStats 
          ? (champStats.deaths === 0 
              ? (champStats.kills + champStats.assists)
              : (champStats.kills + champStats.assists) / champStats.deaths)
          : 0
        const isPerfect = champStats ? champStats.deaths === 0 : false
        return {
          name: champName,
          img: champName,
          games: champStats?.games || 0,
          winrate: champStats ? Math.round((champStats.wins / champStats.games) * 100) : 0,
          masteryPoints: m.championPoints,
          masteryLevel: m.championLevel,
          kda: isPerfect ? kdaValue.toFixed(1) : kdaValue.toFixed(2),
          kdaValue,
          isPerfect
        }
      })
      const result = mapped.filter(c => c.name !== 'Unknown')
      console.log('Mastery result:', result.length, result.map(c => c.name))
      return result
    }
    
    const champList = Object.values(analysis.champions).filter(c => c.games >= 1)
    
    let sorted: typeof champList
    
    if (champMode === 'winrate') {
      // Sort by win rate (min 2 games)
      sorted = champList
        .filter(c => c.games >= 2)
        .sort((a, b) => (b.wins / b.games) - (a.wins / a.games))
    } else {
      // Sort by most games this season
      sorted = champList.sort((a, b) => b.games - a.games)
    }
    
    return sorted.slice(0, 10).map(c => {
      const kdaValue = c.deaths === 0 
        ? (c.kills + c.assists) 
        : (c.kills + c.assists) / c.deaths
      const isPerfect = c.deaths === 0
      return {
        name: c.name,
        img: c.name,
        games: c.games,
        winrate: Math.round((c.wins / c.games) * 100),
        masteryPoints: 0,
        masteryLevel: 0,
        kda: isPerfect ? kdaValue.toFixed(1) : kdaValue.toFixed(2),
        kdaValue,
        isPerfect
      }
    })
  }, [analysis.champions, champMode, masteries, championIdMap])
  
  // Carousel state
  const [carouselIndex, setCarouselIndex] = useState(0)
  const visibleChampions = 4
  const maxCarouselIndex = Math.max(0, topChampions.length - visibleChampions)

  // Reset carousel when mode changes
  useEffect(() => {
    setCarouselIndex(0)
  }, [champMode])

  // Oblicz dodatkowe statystyki do feedbacku
  const avgKDA = analysis.avgKDA.deaths > 0 
    ? ((analysis.avgKDA.kills + analysis.avgKDA.assists) / analysis.avgKDA.deaths)
    : (analysis.avgKDA.kills + analysis.avgKDA.assists)
  
  const killParticipation = analysis.avgKDA.kills + analysis.avgKDA.assists
  const csPerMin = 0 // TODO: dodać CS tracking
  
  // Znajdź najlepszego championa (zawsze wg winrate, niezależnie od trybu karuzeli)
  const bestChamp = useMemo(() => {
    const champList = Object.values(analysis.champions).filter(c => c.games >= 3)
    if (champList.length === 0) return null
    const sorted = champList.sort((a, b) => (b.wins / b.games) - (a.wins / a.games))
    const best = sorted[0]
    return {
      name: best.name,
      winrate: Math.round((best.wins / best.games) * 100),
      games: best.games
    }
  }, [analysis.champions])

  const mostPlayedChamp = useMemo(() => {
    const champList = Object.values(analysis.champions)
    if (champList.length === 0) return null
    return champList.reduce((best, current) => {
      if (!best) return current
      return current.games > best.games ? current : best
    }, champList[0])
  }, [analysis.champions])
  
  // Generuj feedback na podstawie statystyk - rozbudowany system
  type FeedbackItem = { text: string; priority: number; icon?: string }
  
  const allStrengths: FeedbackItem[] = []
  const allImprovements: FeedbackItem[] = []

  // === MOCNE STRONY ===
  
  // Impact Score
  if (analysis.avgImpact >= 8) {
    allStrengths.push({ text: 'Dominujący wpływ na grę - jesteś motorem napędowym drużyny', priority: 10, icon: '🔥' })
  } else if (analysis.avgImpact >= 7) {
    allStrengths.push({ text: 'Wysoki Impact - konsekwentnie wpływasz na wynik', priority: 8, icon: '⚡' })
  } else if (analysis.avgImpact >= 6) {
    allStrengths.push({ text: 'Solidny wkład w grę drużyny', priority: 5, icon: '✦' })
  }

  // Winrate
  if (analysis.winrate >= 65) {
    allStrengths.push({ text: `Fenomenalny winrate ${analysis.winrate}% - utrzymuj to!`, priority: 10, icon: '👑' })
  } else if (analysis.winrate >= 55) {
    allStrengths.push({ text: `Dobry winrate ${analysis.winrate}% - idziesz w górę`, priority: 7, icon: '📈' })
  } else if (analysis.winrate >= 52) {
    allStrengths.push({ text: 'Pozytywny stosunek zwycięstw', priority: 4, icon: '✓' })
  }

  // KDA
  if (avgKDA >= 5) {
    allStrengths.push({ text: `Wybitne KDA ${avgKDA.toFixed(2)} - minimalizujesz błędy`, priority: 9, icon: '💎' })
  } else if (avgKDA >= 4) {
    allStrengths.push({ text: `Świetne KDA ${avgKDA.toFixed(2)} - grasz czysto`, priority: 7, icon: '✨' })
  } else if (avgKDA >= 3) {
    allStrengths.push({ text: 'Dobre proporcje kills/deaths', priority: 5, icon: '⚔️' })
  }

  // Śmierci
  if (analysis.avgKDA.deaths < 3) {
    allStrengths.push({ text: `Tylko ${analysis.avgKDA.deaths.toFixed(1)} śmierci/grę - świetne pozycjonowanie`, priority: 8, icon: '🛡️' })
  } else if (analysis.avgKDA.deaths < 4.5) {
    allStrengths.push({ text: 'Kontrolujesz ilość śmierci', priority: 4, icon: '🛡️' })
  }

  // Trend
  if (analysis.recentTrend > 0.5) {
    allStrengths.push({ text: 'Forma mocno w górę - jesteś w gazie!', priority: 8, icon: '🚀' })
  } else if (analysis.recentTrend > 0.2) {
    allStrengths.push({ text: 'Ostatnie gry powyżej średniej', priority: 5, icon: '📊' })
  }

  // Kill participation (jeśli dużo kills+assists)
  if (killParticipation >= 15) {
    allStrengths.push({ text: 'Bardzo aktywny w walkach teamowych', priority: 6, icon: '⚔️' })
  } else if (killParticipation >= 12) {
    allStrengths.push({ text: 'Dobra partycypacja w zabójstwach', priority: 4, icon: '🎯' })
  }

  // Asysty
  if (analysis.avgKDA.assists >= 8) {
    allStrengths.push({ text: `${analysis.avgKDA.assists.toFixed(1)} asyst/grę - świetne wspieranie drużyny`, priority: 6, icon: '🤝' })
  }

  // Kills
  if (analysis.avgKDA.kills >= 8) {
    allStrengths.push({ text: `${analysis.avgKDA.kills.toFixed(1)} zabójstw/grę - agresywny, skuteczny styl`, priority: 6, icon: '💀' })
  }

  // Stabilność
  const variance = analysis.impactScores.length >= 5 
    ? analysis.impactScores.reduce((sum, score) => sum + Math.pow(score - analysis.avgImpact, 2), 0) / analysis.impactScores.length
    : 0
  const stdDev = Math.sqrt(variance)
  
  if (stdDev < 1 && analysis.impactScores.length >= 5) {
    allStrengths.push({ text: 'Bardzo konsekwentna gra - przewidywalny wynik', priority: 7, icon: '🎯' })
  } else if (stdDev < 1.5 && analysis.impactScores.length >= 5) {
    allStrengths.push({ text: 'Stabilna forma - niewiele wahań', priority: 4, icon: '📊' })
  }

  // Best champ
  if (bestChamp && bestChamp.winrate >= 70 && bestChamp.games >= 5) {
    allStrengths.push({ text: `${bestChamp.name} to twój pocket pick (${bestChamp.winrate}% WR)`, priority: 6, icon: '⭐' })
  }

  // === DO POPRAWY ===

  // Impact Score
  if (analysis.avgImpact < 4) {
    allImprovements.push({ text: 'Niski Impact - sprawdź szczegóły w analizie meczów', priority: 10, icon: '⚠️' })
  } else if (analysis.avgImpact < 5) {
    allImprovements.push({ text: 'Impact poniżej średniej - zobacz gdzie tracisz punkty', priority: 7, icon: '📉' })
  } else if (analysis.avgImpact < 5.5) {
    allImprovements.push({ text: 'Przeciętny wpływ - analiza meczów pokaże co poprawić', priority: 4, icon: '💭' })
  }

  // Winrate
  if (analysis.winrate < 40) {
    allImprovements.push({ text: `Winrate ${analysis.winrate}% - przeanalizuj przegrane mecze`, priority: 10, icon: '🔴' })
  } else if (analysis.winrate < 48) {
    allImprovements.push({ text: `Winrate ${analysis.winrate}% - sprawdź szczegółową analizę`, priority: 7, icon: '📉' })
  } else if (analysis.winrate < 50) {
    allImprovements.push({ text: 'Blisko 50% WR - zobacz co decyduje o wynikach', priority: 4, icon: '⚖️' })
  }

  // Śmierci
  if (analysis.avgKDA.deaths > 7) {
    allImprovements.push({ text: `${analysis.avgKDA.deaths.toFixed(1)} śmierci/grę - sprawdź kiedy giniesz w analizie`, priority: 9, icon: '💀' })
  } else if (analysis.avgKDA.deaths > 5.5) {
    allImprovements.push({ text: 'Za dużo śmierci - zobacz wzorce w historii meczów', priority: 6, icon: '⚠️' })
  } else if (analysis.avgKDA.deaths > 4.5) {
    allImprovements.push({ text: 'Śmierci do optymalizacji - przejrzyj timeline meczów', priority: 3, icon: '💭' })
  }

  // KDA
  if (avgKDA < 1.5) {
    allImprovements.push({ text: `KDA ${avgKDA.toFixed(2)} - analiza pokaże momenty do poprawy`, priority: 8, icon: '🔴' })
  } else if (avgKDA < 2) {
    allImprovements.push({ text: 'Niskie KDA - sprawdź detale w historii gier', priority: 5, icon: '⚠️' })
  }

  // Trend
  if (analysis.recentTrend < -0.5) {
    allImprovements.push({ text: 'Forma spada - porównaj ostatnie mecze z wcześniejszymi', priority: 8, icon: '📉' })
  } else if (analysis.recentTrend < -0.2) {
    allImprovements.push({ text: 'Lekki spadek formy - zobacz co się zmieniło', priority: 5, icon: '⏸️' })
  }

  // Stabilność
  if (stdDev > 2.5 && analysis.impactScores.length >= 5) {
    allImprovements.push({ text: 'Wahania formy - analiza pokaże wzorce wygranych', priority: 6, icon: '📊' })
  } else if (stdDev > 2 && analysis.impactScores.length >= 5) {
    allImprovements.push({ text: 'Niestabilna forma - sprawdź co różni dobre mecze', priority: 4, icon: '🎲' })
  }

  // Niskie kills
  if (analysis.avgKDA.kills < 3 && analysis.avgKDA.assists < 6) {
    allImprovements.push({ text: 'Niska aktywność - zobacz swój udział w walkach', priority: 5, icon: '⚔️' })
  }

  // Sortuj po priorytecie i weź top 2
  const strengths = allStrengths
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 2)
  
  const improvements = allImprovements
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 2)

  // Fallback jeśli puste
  if (strengths.length === 0) {
    strengths.push({ text: 'Graj więcej żeby zobaczyć swoje mocne strony', priority: 0, icon: '🎮' })
  }
  if (improvements.length === 0) {
    improvements.push({ text: 'Świetna robota! Kontynuuj obecny styl gry', priority: 0, icon: '✓' })
  }

  // Określ stabilność
  const getStability = () => {
    if (analysis.impactScores.length < 5) return 'Mało danych'
    const variance = analysis.impactScores.reduce((sum, score) => 
      sum + Math.pow(score - analysis.avgImpact, 2), 0) / analysis.impactScores.length
    const stdDev = Math.sqrt(variance)
    if (stdDev < 1) return 'Wysoka'
    if (stdDev < 2) return 'Średnia'
    return 'Niska'
  }

  // Loading state
  if (matchesLoading) {
    return (
      <main className="profile-page">
        <div className="loading-container">
          <div className="loading-text">Analizuję mecze... {loadingProgress}%</div>
          <div className="loading-bar">
            <div className="loading-fill" style={{ width: `${loadingProgress}%` }}></div>
          </div>
          <div className="loading-subtext">Pobrano {Math.round(loadingProgress / 100 * matchIds.length)} z {matchIds.length} meczów</div>
        </div>
      </main>
    )
  }

  // Przygotuj dane do histogramu (ostatnie 20 impact scores)
  const histogramData = analysis.impactScores.slice(0, 20).reverse()
  const histogramBars = histogramData.length > 0 ? histogramData : [0, 0, 0, 0, 0]
  const histogramMax = Math.max(10, ...histogramBars)
  const impactSegmentCount = 15
  const impactFill = Math.round((Math.min(analysis.avgImpact, 10) / 10) * impactSegmentCount)
  const impactSegments = Array.from({ length: impactSegmentCount }, (_, i) => i < impactFill)

  return (
    <main className="fp">
      {/* ——— HEADER: top line + logo + profile left, rank card right ——— */}
      <div className="fp-header">
        {/* Top line — spans full width, goes behind banner */}
        <div className="fp-top-line"></div>
        <div className="fp-logo" onClick={onLogoClick}>⚔ EDGEANALYSIS</div>
        {/* Profile info */}
        <div className="fp-header-left">
          <div className="fp-profile-card">
            <img src={profileIconUrl} alt="Avatar" className="fp-avatar" />
            <div className="fp-player-text">
              <div className="fp-nick">{account.gameName}<span className="fp-tag">#{account.tagLine}</span></div>
              <div className="fp-subdata">{solo.tier} {solo.rank} – {solo.lp} LP</div>
              <div className="fp-subdata">{analysis.winrate}%&nbsp;&nbsp;&nbsp;&nbsp;{analysis.avgKDA.kills.toFixed(1)}/{analysis.avgKDA.deaths.toFixed(1)}/{analysis.avgKDA.assists.toFixed(1)}&nbsp;&nbsp;&nbsp;&nbsp;{analysis.totalGames}</div>
            </div>
          </div>
        </div>
        {/* Star line + buttons + bottom line — spans full width, goes behind banner */}
        <div className={`fp-btn-wrap tier-${solo.tier.toLowerCase()}`}>
          <div className="fp-bw-star-line">
            <span className="fp-bw-sl-line"></span>
            <span className="fp-bw-sl-star">✦</span>
            <span className="fp-bw-sl-line"></span>
          </div>
          <div className="fp-seg-btns">
            <button className={`fp-seg-btn ${subPage === 'matches' ? 'active' : ''}`} onClick={() => setSubPage('matches')}>Twoje gry</button>
            <button className={`fp-seg-btn ${subPage === 'overview' ? 'active' : ''}`} onClick={() => setSubPage('overview')}>Profil</button>
          </div>
          <div className="fp-bw-line"></div>
        </div>
        {/* Rank banner — SVG banner with wave animation */}
        <div className={`fp-rank-banner tier-${solo.tier.toLowerCase()}`}>
          <img src={bannerSvgUrl} alt="Banner" className="fp-banner-svg" />
        </div>
      </div>

      {subPage === 'overview' ? (
      <div className="fp-content">
        <div className="fp-content-row">
          {/* ——— MOST PLAYED — classic card ——— */}
          <div className="fp-panel fp-most-played">
            <div className="fp-mp-title">Najczęściej grana postać</div>
            <div className="fp-mp-title-line"></div>
            <div className="fp-mp-body">
              <div className="fp-mp-img">
                {mostPlayedChamp ? (
                  <img
                    src={`https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${mostPlayedChamp.name}_0.jpg`}
                    alt={mostPlayedChamp.name}
                  />
                ) : (
                  <div className="fp-mp-placeholder">?</div>
                )}
                {mostPlayedChamp && (
                  <div className="fp-mp-img-overlay">
                    <div className="fp-mp-img-name">{mostPlayedChamp.name}</div>
                  </div>
                )}
              </div>
              <div className="fp-mp-text">
                <div className="fp-mp-header">Najczęściej grana postać</div>
                <div className="fp-mp-name">{mostPlayedChamp ? mostPlayedChamp.name : '—'}</div>
                <div className="fp-mp-sub">NAJWIĘCEJ GIER</div>
                {mostPlayedChamp && (
                  <div className="fp-mp-note">
                    {Math.round((mostPlayedChamp.wins / mostPlayedChamp.games) * 100)}% gier | {mostPlayedChamp.wins} wygr.
                  </div>
                )}
                {mostPlayedChamp && (
                  <div className="fp-mp-kda">
                    KDA: {(mostPlayedChamp.kills / mostPlayedChamp.games).toFixed(1)}/
                    {(mostPlayedChamp.deaths / mostPlayedChamp.games).toFixed(1)}/
                    {(mostPlayedChamp.assists / mostPlayedChamp.games).toFixed(1)}
                  </div>
                )}

              </div>
            </div>
          </div>

          <div className="fp-panel fp-impact">
            <div className="fp-impact-title">Impact</div>
            <div className="fp-impact-title-line"></div>
            <div className="fp-impact-center">
              <div className="fp-impact-star-area">
                <div className="fp-impact-star">
                  <svg viewBox="0 0 100 100" className="fp-impact-star-svg">
                    <polygon points="50,2 63,38 98,38 69,60 80,96 50,74 20,96 31,60 2,38 37,38" fill="currentColor"/>
                  </svg>
                  <div className="fp-impact-val">{analysis.avgImpact.toFixed(1)}</div>
                </div>
              </div>
              <div className="fp-impact-bars">
                {(() => {
                  const segs = 5;
                  const wrFill = Math.round(analysis.winrate / 100 * segs);
                  const kdaFill = Math.round(Math.min(avgKDA / 8, 1) * segs);
                  const stabVal = getStability() === 'Wysoka' ? 0.9 : getStability() === 'Średnia' ? 0.55 : 0.25;
                  const stabFill = Math.round(stabVal * segs);
                  return (
                    <>
                      <div className="fp-impact-bar-row">
                        <span className="fp-impact-bar-label">Wygrane:</span>
                        <div className="fp-impact-bar-segs">
                          {Array.from({length: segs}, (_, i) => (
                            <div key={i} className={`fp-seg ${i < wrFill ? 'filled' : ''}`}></div>
                          ))}
                        </div>
                        <span className="fp-impact-bar-val">{analysis.winrate}%</span>
                      </div>
                      <div className="fp-impact-bar-row">
                        <span className="fp-impact-bar-label">KDA:</span>
                        <div className="fp-impact-bar-segs">
                          {Array.from({length: segs}, (_, i) => (
                            <div key={i} className={`fp-seg ${i < kdaFill ? 'filled' : ''}`}></div>
                          ))}
                        </div>
                        <span className="fp-impact-bar-val">{avgKDA.toFixed(2)}</span>
                      </div>
                      <div className="fp-impact-bar-row">
                        <span className="fp-impact-bar-label">Stabilność:</span>
                        <div className="fp-impact-bar-segs">
                          {Array.from({length: segs}, (_, i) => (
                            <div key={i} className={`fp-seg ${i < stabFill ? 'filled' : ''}`}></div>
                          ))}
                        </div>
                        <span className="fp-impact-bar-val">{getStability()}</span>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>

        <div className="fp-content-row">
          {/* ——— LANES — square boxes ——— */}
          <div className="fp-panel fp-lanes">
            <div className="fp-lanes-title">Linie</div>
            <div className="fp-lanes-title-line"></div>
            <div className="fp-lanes-grid">
              {lanesData.map(lane => {
                const isBest = lane.name === bestLane && lane.games >= 5;
                return (
                  <div key={lane.name} className={`fp-lane-sq ${isBest ? 'fp-lane-best' : ''} ${lane.games === 0 ? 'fp-lane-off' : ''}`}>
                    <img src={lane.iconUrl} alt={lane.name} className="fp-lane-icon" />
                    <span className="fp-lane-name">{lane.name}</span>
                    <span className="fp-lane-games">{lane.games} {pluralGry(lane.games)}</span>
                    <span className="fp-lane-wr">{lane.games > 0 ? `${lane.winrate}%` : '—'}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ——— LAST 20 GAMES — histogram ——— */}
          <div className="fp-panel fp-last-games">
            <div className="fp-lg-title">Ostatnie gry</div>
            <div className="fp-lg-title-line"></div>
            <div className="fp-lg-body">
              <div className="fp-lg-left">
                <div className="fp-lg-info">
                  <span className="fp-lg-big-num">{recentAnalysis.wins}W</span>
                  <span className="fp-lg-big-sep">/</span>
                  <span className="fp-lg-big-num fp-lg-losses">{recentAnalysis.losses}L</span>
                </div>
                <div className="fp-lg-sub">{recentAnalysis.wins + recentAnalysis.losses} {pluralGry(recentAnalysis.wins + recentAnalysis.losses)}</div>
                <div className="fp-lg-stats">
                  <span className="fp-lg-stat">Winrate: <b>{recentAnalysis.winrate}%</b></span>
                  <span className="fp-lg-stat">Impact: <b>{recentAnalysis.avgImpact.toFixed(1)}</b>{recentAnalysis.recentTrend !== 0 && (
                    <span className={recentAnalysis.recentTrend > 0 ? 'fp-lg-trend-up' : 'fp-lg-trend-down'}>
                      {recentAnalysis.recentTrend > 0 ? ' ▲' : ' ▼'}
                    </span>
                  )}</span>
                  <span className="fp-lg-stat">Stabilność: <b>{getStability()}</b></span>
                </div>
              </div>
              <div className="fp-lg-bars">
              {(() => {
                const recent20 = recentMatches.slice(0, 20).reverse();
                const kdas = recent20.map(m => {
                  const p = m.info?.participants?.find((pp: any) => pp.puuid === account.puuid);
                  if (!p) return 0;
                  return p.deaths === 0 ? (p.kills + p.assists) : (p.kills + p.assists) / p.deaths;
                });
                const maxKda = Math.max(8, ...kdas);
                // Log scale to prevent one extreme value from flattening others
                const logScale = (v: number) => Math.log(v + 1) / Math.log(maxKda + 1);
                return kdas.map((kda, i) => (
                  <div key={i} className="fp-lg-bar-wrap" title={kda.toFixed(2)}>
                    <span className="fp-lg-bar-tip">{kda.toFixed(1)}</span>
                    <div className="fp-lg-bar" style={{height: `${logScale(kda) * 100}%`}}></div>
                  </div>
                ));
              })()}
              </div>
            </div>
          </div>
        </div>

        <div className="fp-content-row">
          {/* ——— CHAMPIONS CAROUSEL ——— */}
          <div className="fp-panel fp-champions">
            <div className="fp-champ-tabs">
              <span className="fp-champ-tab-title">Czempioni</span>
              <button className={`fp-champ-tab ${champMode === 'winrate' ? 'active' : ''}`} onClick={() => setChampMode('winrate')}>Win Rate</button>
              <button className={`fp-champ-tab ${champMode === 'mastery' ? 'active' : ''}`} onClick={() => setChampMode('mastery')}>Mastery</button>
              <div className="fp-champ-arrows">
                <button className="fp-arr" disabled={carouselIndex === 0} onClick={() => setCarouselIndex(i => Math.max(0, i - 1))}>◀</button>
                <button className="fp-arr" disabled={carouselIndex >= maxCarouselIndex} onClick={() => setCarouselIndex(i => Math.min(maxCarouselIndex, i + 1))}>▶</button>
              </div>
            </div>
            <div className="fp-champ-title-line"></div>
            <div className="fp-champ-carousel">
              {topChampions.length === 0 ? (
                <div className="fp-no-data">Brak danych</div>
              ) : (
                <div className="fp-champ-track" style={{transform: `translateX(-${carouselIndex * 25}%)`}}>
                  {topChampions.map((champ, idx) => {
                    const kdaClass = champ.isPerfect ? 'kda-perfect' : champ.kdaValue >= 5 ? 'kda-legendary' : champ.kdaValue >= 3 ? 'kda-excellent' : champ.kdaValue >= 2 ? 'kda-good' : 'kda-poor';
                    return (
                      <div key={`${champ.name}-${idx}`} className="fp-champ-card">
                        <img
                          src={`https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${champ.img}_0.jpg`}
                          alt={champ.name}
                          className="fp-champ-splash"
                        />
                        <div className="fp-champ-overlay">
                          <div className="fp-champ-info-bar">
                            <div className="fp-champ-name">{champ.name}</div>
                            <div className="fp-champ-stats">
                              {champMode === 'mastery' ? (
                                <>
                                  <span className="fp-cs-wr">Lvl {champ.masteryLevel}</span>
                                  <span>{champ.masteryPoints >= 1000 ? `${(champ.masteryPoints / 1000).toFixed(0)}k` : champ.masteryPoints} pts</span>
                                </>
                              ) : (
                                <>
                                  <span className="fp-cs-wr">{champ.winrate}%</span>
                                  <span>{champ.games} {pluralGry(champ.games)}</span>
                                  <span className={kdaClass}>{champ.kda} KDA</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      ) : (
      <div className="fp-matches">
        <div className="fp-matches-header">
          <h2 className="fp-matches-title">Twoje mecze</h2>
          <div className="fm-filters">
            <button className={`fm-filter ${matchFilter === 'all' ? 'active' : ''}`} onClick={() => setMatchFilter('all')}>Wszystko</button>
            <button className={`fm-filter ${matchFilter === 'wins' ? 'active' : ''}`} onClick={() => setMatchFilter('wins')}>Wygrane</button>
            <button className={`fm-filter ${matchFilter === 'losses' ? 'active' : ''}`} onClick={() => setMatchFilter('losses')}>Przegrane</button>
          </div>
        </div>
        <div className={`fp-matches-list ${expandedMatch !== null ? 'has-expanded' : ''}`}>
          {recentMatches
            .filter(match => {
              if (matchFilter === 'all') return true
              const p = match.info.participants.find(pp => pp.puuid === account.puuid)
              if (!p) return false
              return matchFilter === 'wins' ? p.win : !p.win
            })
            .map((match, idx) => {
            const p = match.info.participants.find(pp => pp.puuid === account.puuid)
            if (!p) return null
            const win = p.win
            const kda = `${p.kills}/${p.deaths}/${p.assists}`
            const kdaVal = p.deaths === 0 ? (p.kills + p.assists) : (p.kills + p.assists) / p.deaths
            const cs = p.totalMinionsKilled + (p.neutralMinionsKilled || 0)
            const duration = Math.floor(match.info.gameDuration / 60)
            const champImg = `https://ddragon.leagueoflegends.com/cdn/16.3.1/img/champion/${p.championName}.png`
            const lane = normalizePosition(p.teamPosition)
            const laneIcon = laneIconUrls[lane] || ''
            const csPerMin = duration > 0 ? (cs / duration).toFixed(1) : '0.0'
            const kdaClass = kdaVal >= 5 ? 'kda-legendary' : kdaVal >= 3 ? 'kda-excellent' : kdaVal >= 2 ? 'kda-good' : 'kda-poor'
            const isExpanded = expandedMatch === idx
            
            // teams
            const myTeam = match.info.participants.filter(pp => pp.teamId === p.teamId)
            const enemyTeam = match.info.participants.filter(pp => pp.teamId !== p.teamId)
            const myTeamData = match.info.teams?.find(t => t.teamId === p.teamId)
            const enemyTeamData = match.info.teams?.find(t => t.teamId !== p.teamId)
            
            // Time ago
            const timeAgo = match.info.gameCreation ? (() => {
              const diff = Date.now() - match.info.gameCreation
              const mins = Math.floor(diff / 60000)
              if (mins < 60) return `${mins} min temu`
              const hrs = Math.floor(mins / 60)
              if (hrs < 24) return `${hrs}h temu`
              const days = Math.floor(hrs / 24)
              return `${days}d temu`
            })() : ''
            
            // Ranking all 10 players — EdgeScore
            const rankings = rankPlayersInMatch(match.info.participants, match.info.gameDuration, match.info.teams)
            const myRank = rankings.get(p.puuid)
            
            // Item images helper — guard against undefined/NaN/0
            const itemImg = (itemId: number | undefined) => (itemId && itemId > 0) ? `https://ddragon.leagueoflegends.com/cdn/16.3.1/img/item/${itemId}.png` : null
            const itemName = (itemId: number | undefined) => (itemId && itemId > 0 && itemNames[itemId]) ? itemNames[itemId] : ''
            
            return (
              <div key={idx} className={`fm-card ${win ? 'fm-win' : 'fm-loss'} ${isExpanded ? 'fm-expanded' : ''}`}
                ref={el => { if (isExpanded && el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50) }}>
                <div className="fm-row" onClick={() => setExpandedMatch(isExpanded ? null : idx)}>
                  <div className="fm-result-bar"></div>
                  <div className="fm-champ">
                    <img src={champImg} alt={p.championName} />
                    <span className="fm-level">{p.champLevel}</span>
                    {laneIcon && <img src={laneIcon} alt={lane} className="fm-lane-icon" />}
                  </div>
                  <div className="fm-main">
                    <div className="fm-champ-name">{p.championName}</div>
                    <div className={`fm-kda ${kdaClass}`}>{kda} <span className="fm-kda-val">{kdaVal.toFixed(2)}:1</span></div>
                  </div>
                  <div className="fm-items">
                    {[p.item0, p.item1, p.item2, p.item3, p.item4, p.item5].map((item, i) => {
                      const src = itemImg(item)
                      return <div key={i} className="fm-item">{src ? <img src={src} alt="" title={itemName(item)} onError={e => { (e.target as HTMLImageElement).style.display='none' }} /> : null}</div>
                    })}
                    <div className="fm-item fm-trinket">{itemImg(p.item6) ? <img src={itemImg(p.item6)!} alt="" title={itemName(p.item6)} onError={e => { (e.target as HTMLImageElement).style.display='none' }} /> : null}</div>
                  </div>
                  <div className="fm-stats">
                    <span>{cs} CS ({csPerMin}/min)</span>
                    <span>{p.totalDamageDealtToChampions?.toLocaleString() || 0} DMG</span>
                  </div>
                  <div className="fm-meta">
                    <span className="fm-impact">EdgeScore <b>{myRank?.score.toFixed(0) || '?'}</b></span>
                    <span className={`fm-rank-inline rank-${myRank?.rank || 10}`}>#{myRank?.rank || '?'}{myRank?.rank === 1 ? ' MVP' : ''}</span>
                    <span className="fm-time">{duration} min</span>
                    {timeAgo && <span className="fm-ago">{timeAgo}</span>}
                  </div>
                  <div className="fm-teams-mini">
                    <div className="fm-team-mini">
                      {myTeam.map((tp, ti) => (
                        <img key={ti} src={`https://ddragon.leagueoflegends.com/cdn/16.3.1/img/champion/${tp.championName}.png`} alt={tp.championName} title={tp.riotIdGameName || tp.championName} />
                      ))}
                    </div>
                    <div className="fm-team-mini">
                      {enemyTeam.map((tp, ti) => (
                        <img key={ti} src={`https://ddragon.leagueoflegends.com/cdn/16.3.1/img/champion/${tp.championName}.png`} alt={tp.championName} title={tp.riotIdGameName || tp.championName} />
                      ))}
                    </div>
                  </div>
                  <div className="fm-expand-btn">{isExpanded ? '▲' : '▼'}</div>
                </div>
                
                {isExpanded && (
                  <div className="fm-details">
                    <div className="fm-scoreboard">
                      {/* My team */}
                      <div className="fm-sb-team">
                        <div className="fm-sb-team-header fm-sb-ally">
                          <span className="fm-sb-hdr-rank">#</span>
                          <span>{win ? 'Zwycięstwo' : 'Porażka'} (Twój zespół)</span>
                          <div className="fm-sb-cols">
                            <span>Score</span>
                            <span>KDA</span>
                            <span>DMG</span>
                            <span>CS</span>
                            <span>Wardy</span>
                            <span>Złoto</span>
                          </div>
                          <span className="fm-sb-hdr-items">Itemy</span>
                        </div>
                        {myTeam.map((tp, ti) => {
                          const tpCs = tp.totalMinionsKilled + (tp.neutralMinionsKilled || 0)
                          const tpKdaVal = tp.deaths === 0 ? (tp.kills + tp.assists) : (tp.kills + tp.assists) / tp.deaths
                          const isMe = tp.puuid === account.puuid
                          const playerRank = rankings.get(tp.puuid)
                          const bd = playerRank?.breakdown
                          return (
                            <div key={ti} className={`fm-sb-row ${isMe ? 'fm-sb-me' : ''}`}>
                              <div className="fm-sb-rank">
                                <span className={`fm-rank-badge rank-${playerRank?.rank || 10}`}>#{playerRank?.rank || '?'}</span>
                              </div>
                              <div className="fm-sb-player">
                                <img src={`https://ddragon.leagueoflegends.com/cdn/16.3.1/img/champion/${tp.championName}.png`} alt={tp.championName} title={tp.championName} className="fm-sb-champ" />
                                <div className="fm-sb-name">
                                  <span>{tp.riotIdGameName || tp.summonerName || tp.championName}</span>
                                  <small>{tp.championName}</small>
                                </div>
                              </div>
                              <div className="fm-sb-cols">
                                <span className="fm-sb-score" title={bd ? `Walka: ${bd.combat.toFixed(1)} | DMG: ${bd.damage.toFixed(1)} | Cele: ${bd.objectives.toFixed(1)} | Ekonomia: ${bd.economy.toFixed(1)} | Wizja: ${bd.vision.toFixed(1)} | Użyteczność: ${bd.utility.toFixed(1)} | Clutch: ${bd.clutch.toFixed(1)} | Impact: ${bd.impact.toFixed(1)} | Wkład w wygraną: ${bd.winContribution.toFixed(1)}` : ''}>
                                  <b>{playerRank?.score.toFixed(0) || '?'}</b>
                                  {bd && <span className="fm-sb-score-bar">
                                    <i className="bar-combat" style={{width: `${Math.min(bd.combat / 25 * 100, 100)}%`}}></i>
                                    <i className="bar-obj" style={{width: `${Math.min(bd.objectives / 20 * 100, 100)}%`}}></i>
                                    <i className="bar-impact" style={{width: `${Math.min(bd.impact / 10 * 100, 100)}%`}}></i>
                                    <i className="bar-utility" style={{width: `${Math.min(bd.utility / 12 * 100, 100)}%`}}></i>
                                  </span>}
                                </span>
                                <span className="fm-sb-kda">{tp.kills}/{tp.deaths}/{tp.assists} <small>({tpKdaVal.toFixed(1)})</small></span>
                                <span>{tp.totalDamageDealtToChampions?.toLocaleString()}</span>
                                <span>{tpCs}</span>
                                <span>{tp.wardsPlaced || 0}/{tp.wardsKilled || 0}</span>
                                <span>{tp.goldEarned?.toLocaleString()}</span>
                              </div>
                              <div className="fm-sb-items">
                                {[tp.item0, tp.item1, tp.item2, tp.item3, tp.item4, tp.item5, tp.item6].map((item, ii) => {
                                  const src = itemImg(item)
                                  return <div key={ii} className="fm-sb-item">{src ? <img src={src} alt="" title={itemName(item)} onError={e => { (e.target as HTMLImageElement).style.display='none' }} /> : null}</div>
                                })}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      {/* Enemy team */}
                      <div className="fm-sb-team">
                        <div className="fm-sb-team-header fm-sb-enemy">
                          <span className="fm-sb-hdr-rank">#</span>
                          <span>{!win ? 'Zwycięstwo' : 'Porażka'} (Przeciwnicy)</span>
                          <div className="fm-sb-cols">
                            <span>Score</span>
                            <span>KDA</span>
                            <span>DMG</span>
                            <span>CS</span>
                            <span>Wardy</span>
                            <span>Złoto</span>
                          </div>
                          <span className="fm-sb-hdr-items">Itemy</span>
                        </div>
                        {enemyTeam.map((tp, ti) => {
                          const tpCs = tp.totalMinionsKilled + (tp.neutralMinionsKilled || 0)
                          const tpKdaVal = tp.deaths === 0 ? (tp.kills + tp.assists) : (tp.kills + tp.assists) / tp.deaths
                          const playerRank = rankings.get(tp.puuid)
                          const bd = playerRank?.breakdown
                          return (
                            <div key={ti} className="fm-sb-row">
                              <div className="fm-sb-rank">
                                <span className={`fm-rank-badge rank-${playerRank?.rank || 10}`}>#{playerRank?.rank || '?'}</span>
                              </div>
                              <div className="fm-sb-player">
                                <img src={`https://ddragon.leagueoflegends.com/cdn/16.3.1/img/champion/${tp.championName}.png`} alt={tp.championName} title={tp.championName} className="fm-sb-champ" />
                                <div className="fm-sb-name">
                                  <span>{tp.riotIdGameName || tp.summonerName || tp.championName}</span>
                                  <small>{tp.championName}</small>
                                </div>
                              </div>
                              <div className="fm-sb-cols">
                                <span className="fm-sb-score" title={bd ? `Walka: ${bd.combat.toFixed(1)} | DMG: ${bd.damage.toFixed(1)} | Cele: ${bd.objectives.toFixed(1)} | Ekonomia: ${bd.economy.toFixed(1)} | Wizja: ${bd.vision.toFixed(1)} | Użyteczność: ${bd.utility.toFixed(1)} | Clutch: ${bd.clutch.toFixed(1)} | Impact: ${bd.impact.toFixed(1)} | Wkład w wygraną: ${bd.winContribution.toFixed(1)}` : ''}>
                                  <b>{playerRank?.score.toFixed(0) || '?'}</b>
                                  {bd && <span className="fm-sb-score-bar">
                                    <i className="bar-combat" style={{width: `${Math.min(bd.combat / 25 * 100, 100)}%`}}></i>
                                    <i className="bar-obj" style={{width: `${Math.min(bd.objectives / 20 * 100, 100)}%`}}></i>
                                    <i className="bar-impact" style={{width: `${Math.min(bd.impact / 10 * 100, 100)}%`}}></i>
                                    <i className="bar-utility" style={{width: `${Math.min(bd.utility / 12 * 100, 100)}%`}}></i>
                                  </span>}
                                </span>
                                <span className="fm-sb-kda">{tp.kills}/{tp.deaths}/{tp.assists} <small>({tpKdaVal.toFixed(1)})</small></span>
                                <span>{tp.totalDamageDealtToChampions?.toLocaleString()}</span>
                                <span>{tpCs}</span>
                                <span>{tp.wardsPlaced || 0}/{tp.wardsKilled || 0}</span>
                                <span>{tp.goldEarned?.toLocaleString()}</span>
                              </div>
                              <div className="fm-sb-items">
                                {[tp.item0, tp.item1, tp.item2, tp.item3, tp.item4, tp.item5, tp.item6].map((item, ii) => {
                                  const src = itemImg(item)
                                  return <div key={ii} className="fm-sb-item">{src ? <img src={src} alt="" title={itemName(item)} onError={e => { (e.target as HTMLImageElement).style.display='none' }} /> : null}</div>
                                })}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    {/* Team totals bar */}
                    <div className="fm-totals">
                      <div className="fm-total-side fm-total-ally">
                        <span>{myTeam.reduce((s, tp) => s + tp.kills, 0)}/{myTeam.reduce((s, tp) => s + tp.deaths, 0)}/{myTeam.reduce((s, tp) => s + tp.assists, 0)}</span>
                        <span>{myTeam.reduce((s, tp) => s + tp.goldEarned, 0).toLocaleString()} złota</span>
                      </div>
                      <div className="fm-total-vs">VS</div>
                      <div className="fm-total-side fm-total-enemy">
                        <span>{enemyTeam.reduce((s, tp) => s + tp.kills, 0)}/{enemyTeam.reduce((s, tp) => s + tp.deaths, 0)}/{enemyTeam.reduce((s, tp) => s + tp.assists, 0)}</span>
                        <span>{enemyTeam.reduce((s, tp) => s + tp.goldEarned, 0).toLocaleString()} złota</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      )}
    </main>
  )
}

function MatchCard({ matchId, puuid, routing }: { matchId: string, puuid: string, routing: string }){
  const [matchData, setMatchData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    const fetchMatch = async () => {
      try {
        const data = await riotFetch<any>(`/api/riot/match/${matchId}?routing=${routing}`)
        setMatchData(data)
      } catch (err) {
        console.error('Błąd pobierania meczu:', matchId, err)
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    // Małe opóźnienie żeby uniknąć rate limit
    const delay = Math.random() * 500
    const timer = setTimeout(fetchMatch, delay)
    return () => clearTimeout(timer)
  }, [matchId, routing])

  if (loading) {
    return (
      <div className="match-card loading">
        <div className="match-loading">Ładowanie...</div>
      </div>
    )
  }

  if (!matchData) {
    return (
      <div className="match-card error">
        <div className="match-id">{matchId}</div>
      </div>
    )
  }

  // Znajdź gracza w meczu
  const participant = matchData.info?.participants?.find((p: any) => p.puuid === puuid)
  if (!participant) {
    return (
      <div className="match-card">
        <div className="match-id">{matchId}</div>
      </div>
    )
  }

  const win = participant.win
  const champIcon = `https://ddragon.leagueoflegends.com/cdn/16.3.1/img/champion/${participant.championName}.png`
  const kda = `${participant.kills}/${participant.deaths}/${participant.assists}`
  const cs = participant.totalMinionsKilled + (participant.neutralMinionsKilled || 0)
  const gameDuration = Math.floor(matchData.info.gameDuration / 60)
  const gameMode = matchData.info.gameMode

  return (
    <div className={`match-card ${win ? 'win' : 'loss'}`}>
      <div className="match-result">{win ? 'W' : 'L'}</div>
      <div className="match-champ">
        <img src={champIcon} alt={participant.championName} />
      </div>
      <div className="match-info">
        <div className="match-kda">{kda}</div>
        <div className="match-cs">{cs} CS</div>
      </div>
      <div className="match-meta">
        <div className="match-mode">{gameMode}</div>
        <div className="match-duration">{gameDuration}min</div>
      </div>
    </div>
  )
}
