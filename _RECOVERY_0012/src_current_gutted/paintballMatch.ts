
  // Punto para un equipo (solo en fase activa de modo equipos)
  pbBus.on(PB_MSG.teamScore, (m: TeamScoreMsg) => {
    if (!isHost()) return
    const st = PBMatch.getMutable(matchEntity)
    if (st.phase !== 2 || st.mode !== 1) return
    if (m.team === 1) st.scoreT++
    else if (m.team === 2) st.scoreCT++
  })

  engine.addSystem(matchSystem)
}

function matchSystem(dt: number) {
  const st = PBMatch.getOrNull(matchEntity)
  if (!st) return

  // Reflejar a PaintballState para la UI (en todos los clientes)
  PaintballState.matchPhase = st.phase
  PaintballState.matchMode = st.mode
  PaintballState.matchTimer = st.timer
  PaintballState.teamScoreT = st.scoreT
  PaintballState.teamScoreCT = st.scoreCT
  PaintballState.matchWinner = st.winner
  PaintballState.matchBots = st.bots === 1

  if (!isHost()) return

  const m = PBMatch.getMutable(matchEntity)
  if (m.phase === 1) {
    m.timer -= dt
    if (m.timer <= 0) {
      m.phase = 2
      m.timer = ROUND_SECONDS
    }
  } else if (m.phase === 2) {
    m.timer -= dt
    let over = m.timer <= 0
    if (m.mode === 1 && (m.scoreT >= TEAM_SCORE_CAP || m.scoreCT >= TEAM_SCORE_CAP)) over = true
    if (over) {
      m.winner = m.scoreT > m.scoreCT ? 1 : m.scoreCT > m.scoreT ? 2 : 0
      m.phase = 3
      m.timer = 10
    }
  } else if (m.phase === 3) {
    m.timer -= dt
    if (m.timer <= 0) {
      m.phase = 0
      m.timer = 0
    }
  }