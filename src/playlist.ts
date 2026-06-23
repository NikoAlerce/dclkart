// ─── Estado de la playlist de la pantalla — MUTABLE y compartido ──────────────
// Lo leen: el sistema de reproducción (index.ts) y el panel de admin (ui.tsx).
// v2: controles completos estilo Winamp:
//     prev · next · jump · mute · shuffle · save/load playlist JSON.

export type Track = { url: string; aspect: number; name: string }

// Wallet del owner del World (admin). Solo esta address ve el panel de admin.
export const OWNER_ADDRESS = '0x70400e1b9cf40151e5c76df8b7c95c87001f51fb'

const initial: Track[] = [
  { url: 'https://ipfs.io/ipfs/QmNMpzm5PvX1QKxbCEYwnXUwp3skociE8gmUERJvjtDyg6', aspect: 1.7778, name: 'The Blender Cube' },
  { url: 'https://ipfs.io/ipfs/QmTvtJ8hm2LcKapyy7jgaDZCF2Kjodq4EnQKyARqZUt8Gf', aspect: 1.7778, name: 'Bosque Gracias - Grand Prix' },
  { url: 'https://ipfs.io/ipfs/QmX62nMbhKvxFyMnXKXnLRpQxAEHxY4igjxezA4xVZ9mqu', aspect: 1.0,    name: 'Shadowbanned' },
  { url: 'https://ipfs.io/ipfs/QmRQMFSXDzVhovgwkDL24ZDBJ6hSFw9iBAUfUvYcutWCkJ', aspect: 1.7778, name: 'Mask (Music Video)' },
  { url: 'https://ipfs.io/ipfs/bafybeicx4timviogae26hfj4fxarlfp2cqpe5c3u5nmg4p6qw52z76xtm4', aspect: 1.3241, name: 'Time is Weird' },
  { url: 'https://ipfs.io/ipfs/bafybeid4iv7nwvuy6vpltqhd46i4sngzhkhfwme7qf4tck34kswfbn26xy', aspect: 1.7778, name: 'Color Drunk' },
  { url: 'https://ipfs.io/ipfs/bafybeic5qjx5bx56oysqqafuu6l6tvtiz46wegw3x443pmekyuojushz5i', aspect: 1.7778, name: 'From Here to There' },
  { url: 'https://ipfs.io/ipfs/QmepeKaRF6paVQiMunSTLQZkNQp2Akr6vbgtZzCnkyjLTb', aspect: 1.0,    name: 'Revelacion' },
  { url: 'https://ipfs.io/ipfs/QmaZN5tJALMFKvSKCrEBLp8UdMvca928GaWfssVciiJWpw', aspect: 1.0,    name: 'Cats lifestyle' },
  { url: 'https://ipfs.io/ipfs/QmPZKj1ZzuiJQtFULNkYVwkSHZtyjmTVZXxecUKRZML647', aspect: 1.0,    name: 'Psy Youth' },
  { url: 'https://ipfs.io/ipfs/QmYkwtpVoiULphVqLHCcATZhqsZG746jpSCTWm6vSKd1y8', aspect: 1.0,    name: 'Party Time in CartoonLand' },
  { url: 'https://ipfs.io/ipfs/QmTvAe1Wcm9Yc27LM1JHbeXJTuPn9hzbz3zYZGu8F7w3h8', aspect: 1.0,    name: 'We got through it' },
  { url: 'https://ipfs.io/ipfs/QmZ54c3ifxESNkGfTfavsaXMPUYxBpCo848nVt4ntz29RB', aspect: 1.0,    name: 'Beyond Worlds Cover Art' },
  { url: 'https://ipfs.io/ipfs/QmYWA36u5ThFDq51ej4nLhhFRoSiEWaNjWi1uQBTitqGdE', aspect: 0.9508, name: 'Floating' },
  { url: 'https://ipfs.io/ipfs/QmcTmXEtx7bFFWntw39njNoipyGzEvG4TmMXaksKnUxFKx', aspect: 1.0,    name: 'Chapter 1: Meeting Teia' },
  { url: 'https://ipfs.io/ipfs/QmT6ax2rAGBPv5WHqNkygUjin62wyybcdM9HBPj6pJYoEb', aspect: 1.0,    name: 'Chapter 2: Teia Goes Through the Portal' },
  { url: 'https://ipfs.io/ipfs/QmcNPKqa9xAUMnjhgcppaEZZ2Ng1rifL1pYcBJ4SB6uJMe', aspect: 1.0,    name: 'Sutil' },
  { url: 'https://ipfs.io/ipfs/QmYTLMD2Ugdnyo9AmMi4pdKkdNYP5fj9vRTMdpAcRif5tw', aspect: 1.0,    name: "Everybody's Gotta Learn Sometime" },
  { url: 'https://ipfs.io/ipfs/QmQYsShEGcpiM51EV641jG2f73p9G7KtYFyYGzS8Gt7RXi', aspect: 1.0,    name: 'Chapter 7: Biofield Empathy Interface' },
  { url: 'https://ipfs.io/ipfs/QmZZeJ1w2nxup7Em2VGXsQAswXx5CeaqudfdGrbfygTJQQ', aspect: 1.0,    name: 'Chapter 7b: Biofield Empathy Interface' },
  { url: 'https://ipfs.io/ipfs/QmYKw8x9sfeZWRXJNs97Coib3huxdnrUQGpMKFe1W7UXLo', aspect: 1.0,    name: 'Chapter 8: Valley of the Heart' },
  { url: 'https://ipfs.io/ipfs/QmPfFRfZhhiNiZAi2uiQtEgmBDDuNXU7wpNtAJeKURwWuG', aspect: 1.0,    name: 'Ninja Training' },
  { url: 'https://ipfs.io/ipfs/QmNgrvg3Y39yu4M48QF3ZYK8sHD1nQ6Ya7BKYC1uA9jioT', aspect: 1.0,    name: 'Skating through the portal' },
  { url: 'https://ipfs.io/ipfs/QmePoBJNoDKKbMzL1G362XVNwaBqrcUgv3ksg7QT6vbrNf', aspect: 1.0,    name: 'oh no its the snowboard people again' },
  { url: 'https://ipfs.io/ipfs/Qme5rsKinnJxRAsBooQKcd9iMYFGfWm9Ssjq75pXKTwssQ', aspect: 1.0,    name: 'Halloween GLITCHY DREAMS' },
  { url: 'https://ipfs.io/ipfs/QmcpukbuXnZhseJXHJLXsAPXJZU4fT67xHEHRKWVh2AvWp', aspect: 1.0,    name: 'Every piece of Traditional Art' },
  { url: 'https://ipfs.io/ipfs/QmYhAyRVqazAhkYPDvNEfsREuQpuf56sMRn8Jo8LAwFvr9', aspect: 1.0,    name: 'Vuelapelucas 3000 Jingle (2023)' },
  { url: 'https://ipfs.io/ipfs/QmTvyVrpaz6VAoBdynQS7MYED4G3kNx9vhKPyrnyjqX2a2', aspect: 1.0,    name: 'Outdoors' },
  { url: 'https://ipfs.io/ipfs/QmYLsWdUb71hopxFLAsoNZmTWacyKNMBPj91qTjkvFTDEB', aspect: 1.0,    name: 'Spirit of HEN' },
  { url: 'https://ipfs.io/ipfs/QmQJLdCAmf4ofqN6AQaSTNSNgKxAAMHxXhrzMPSbwpmx1y', aspect: 1.0,    name: 'Episode 1: Nanuq Crew' },
  { url: 'https://ipfs.io/ipfs/QmdatBWpS1VNoS9Cdzu69Yx2cpmn5jfYsLmfEvDAeXb3Bb', aspect: 1.0,    name: 'good times at BG' },
  { url: 'https://ipfs.io/ipfs/QmdmrSztWhfdwZpYDfUzMXYYw5PPsEZkN8X6X95F5eFr1y', aspect: 0.6667, name: 'Fragment Decryption' },
  { url: 'https://ipfs.io/ipfs/QmYtmjznBJn3eM735BaHiNKtgAPw6E3fP2DWTRtexcR8nM', aspect: 1.0,    name: 'real' },
  { url: 'https://ipfs.io/ipfs/QmfUm2Ywzx1yXeVtADJN7YF9kXKPgGRZzCyJqDC3QGjt3L', aspect: 1.0,    name: 'lost' },
  { url: 'https://ipfs.io/ipfs/QmRJTUkAiSFUzF3FUk3CWYWLWeZ6NPeikMEgx2vRvLmqLc', aspect: 1.0,    name: 'Holy Mountain' },
  { url: 'https://ipfs.io/ipfs/QmWBHfkNFE5JTg1iHGC2m6uR4cX1ytDaMuJR7yTFtumuTX', aspect: 1.0,    name: 'Holy Mountain 2' },
  { url: 'https://ipfs.io/ipfs/bafybeihlzwp5sq5hv2acao223ii7knsrdnt5bvkldaxfmx6fst42dgxyxe', aspect: 1.7778, name: 'Niko Alerce' },
  { url: 'https://ipfs.io/ipfs/bafybeib5vhxkwgmwxm5ovsbfzk62p6n3l6mjawe2i3z2pqf7okdvo6adla', aspect: 1.0,    name: 'Clouds' },
  { url: 'https://ipfs.io/ipfs/bafybeigsax7lcjw22t4j6setszsgf36gykxjiu2zlylof4e3fliswwgcwm', aspect: 0.767,  name: 'Boppenheimer Team Bigfoot' },
  { url: 'https://ipfs.io/ipfs/bafybeicy5h7iirysrkce7cqalmt5dsuzu4zmi3acfu3reiswkfjsvqqkee', aspect: 1.7778, name: 'Floating at the Beach' },
  { url: 'https://ipfs.io/ipfs/bafybeihnsq6lvit5ff4hurw4kdbpg5ykvbs5uupv4lqd5ayefg25qpnyiy', aspect: 1.3333, name: 'Cronica de una residencia' }
]

export const Playlist = {
  tracks:      initial as Track[],
  shuffle:     true,
  skipToken:   0,    // incrementar → saltar al siguiente
  prevToken:   0,    // incrementar → ir al track anterior
  jumpTo:     -1,    // índice al que saltar directamente (-1 = ninguno)
  paused:      false,
  volume:      1,    // 0..1 (se mantiene aunque estés muteado)
  muted:       false, // silenciar sin perder el volumen guardado
  loadToken:   0,    // se incrementa al cargar una playlist nueva via loadPlaylistJson
  currentIndex: 0,
  seekTo:     -1,    // tiempo en segundos al que buscar (-1 = ninguno)
  currentTime: 0,    // tiempo actual (se actualiza desde el engine)
  duration:    0     // duración total (se actualiza desde el engine)
}

// ── Agregar un track a la lista ──────────────────────────────────────────────
export function addTrack(url: string): boolean {
  const u = url.trim()
  if (!u || !(u.startsWith('http://') || u.startsWith('https://'))) return false
  if (Playlist.tracks.some(t => t.url === u)) return false
  Playlist.tracks.push({ url: u, aspect: 1.7778, name: 'Agregado' })
  return true
}

// ── Eliminar un track por índice ─────────────────────────────────────────────
export function removeTrack(i: number) {
  if (Playlist.tracks.length <= 1) return
  if (i >= 0 && i < Playlist.tracks.length) Playlist.tracks.splice(i, 1)
}

// ── Controles de reproducción ────────────────────────────────────────────────
export function toggleShuffle()  { Playlist.shuffle  = !Playlist.shuffle }
export function requestSkip()    { Playlist.skipToken++ }
export function previousTrack()  { Playlist.prevToken++ }
export function jumpToTrack(i: number) {
  if (i >= 0 && i < Playlist.tracks.length) Playlist.jumpTo = i
}
export function togglePause() { Playlist.paused = !Playlist.paused }
export function toggleMute()  { Playlist.muted  = !Playlist.muted }
// Saltar a una fracción (0..1) de la duración del video actual. El system de index.ts
// lee Playlist.seekTo y mueve la posición del VideoPlayer. Clamp a dur-0.5 para no caer
// justo en el final (eso dispararía el avance al siguiente video).
export function seekToFraction(frac: number) {
  const f = Math.max(0, Math.min(1, frac))
  if (Playlist.duration > 0) Playlist.seekTo = Math.min(f * Playlist.duration, Playlist.duration - 0.5)
}
// Saltar ±N segundos. Si hay un seek pendiente sin consumir, encadenamos desde ahí
// (clicks rápidos) en vez de desde currentTime, que llega con retraso desde los VideoEvent.
export function seekRelative(deltaSec: number) {
  if (Playlist.duration <= 0) return
  const base = Playlist.seekTo >= 0 ? Playlist.seekTo : (Playlist.currentTime || 0)
  Playlist.seekTo = Math.max(0, Math.min(base + deltaSec, Playlist.duration - 0.5))
}
export function changeVolume(delta: number) {
  Playlist.volume = Math.max(0, Math.min(1, Math.round((Playlist.volume + delta) * 10) / 10))
}

// ── Serialización de la playlist ─────────────────────────────────────────────
export function savePlaylistJson(): string {
  return JSON.stringify(Playlist.tracks)
}

export function loadPlaylistJson(json: string): boolean {
  try {
    const arr: unknown = JSON.parse(json)
    if (!Array.isArray(arr) || arr.length === 0) return false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const valid = (arr as any[]).filter((t: any) => t?.url && typeof t.url === 'string')
    if (valid.length === 0) return false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Playlist.tracks = valid.map((t: any): Track => ({
      url:    String(t.url),
      aspect: typeof t.aspect === 'number' ? t.aspect : 1.7778,
      name:   typeof t.name   === 'string' ? t.name   : 'Track'
    }))
    Playlist.currentIndex = 0
    Playlist.loadToken++
    return true
  } catch {
    return false
  }
}

// ── Curated Internet Archive Recitals Playlist (Alt Rock, Hip-Hop, Trip-Hop) ──
const archiveRecitals: Track[] = [
  { url: 'https://archive.org/download/red-hot-chili-peppers-live-at-slane-castle-2003/Red%20Hot%20Chili%20Peppers%20-%20Live%20at%20Slane%20Castle%20%282003%29/Red%20Hot%20Chili%20Peppers%20-%20Live%20at%20Slane%20Castle%20%282003%29.mp4', aspect: 1.3333, name: 'Red Hot Chili Peppers - Live at Slane Castle (2003)' },
  { url: 'https://archive.org/download/NirvanaLTSOBestQuality/VIDEO_TS/VTS_01_0.mp4', aspect: 1.3333, name: 'Nirvana - Live Tonight! Sold Out!' },
  { url: 'https://archive.org/download/NirvanaLiveAtReading1992/Nirvana%20-%20(1992)%20-%20Live%20At%20Reading.mp4', aspect: 1.3333, name: 'Nirvana - Live at Reading (1992)' },
  { url: 'https://archive.org/download/radiohead-paranoid-android-live-at-glastonbury-2003-hq-chf-3/Radiohead%20-%20Paranoid%20Android%20%20%20Live%20at%20Glastonbury%202003%20(HQ)_chf3.mp4', aspect: 1.3333, name: 'Radiohead - Live at Glastonbury (2003)' },
  { url: 'https://archive.org/download/pearl-jam-live-at-the-garden-disk-1/Pearl%20Jam%20-%20Live%20at%20the%20Garden%20Disk%201.mp4', aspect: 1.3333, name: 'Pearl Jam - Live At The Garden Disk 1' },
  { url: 'https://archive.org/download/youtube-sZgkNkifoKY/Linkin_Park_-_Lying_From_You_Live_In_Texas_Video-sZgkNkifoKY.mp4', aspect: 1.3333, name: 'Linkin Park - Lying From You (Live in Texas)' },
  { url: 'https://archive.org/download/rage-against-the-machine-live-pinkpop-festival-landgraaf-nl-23.05.1994/Rage%20Against%20The%20Machine%20-%20Live%20Pinkpop%20Festival%2C%20Landgraaf%2C%20NL%20-%20%2823.05.1994%29.mp4', aspect: 1.3333, name: 'Rage Against The Machine - Live Pinkpop Festival (1994)' },
  { url: 'https://archive.org/download/beastie-boys-you-gotta-fight-1986/Beastie%20Boys%20-%20You%20Gotta%20Fight%20(1986).mp4', aspect: 1.3333, name: 'Beastie Boys - You Gotta Fight (1986)' },
  { url: 'https://archive.org/download/cypresshliventsc/cypresshliventsc.mp4', aspect: 1.3333, name: 'Cypress Hill - Live!' },
  { url: 'https://archive.org/download/youtube-lQJ4NG79lkg/lQJ4NG79lkg.mp4', aspect: 1.3333, name: 'Public Enemy - Live in Uppsala (2011)' },
  { url: 'https://archive.org/download/saturday-night-live-s-42-e-06-dave-chappelle_202412/Saturday%20Night%20Live%20S42E06%20Dave%20Chappelle.mp4', aspect: 1.3333, name: 'A Tribe Called Quest - Live on SNL' },
  { url: 'https://archive.org/download/snoop-dogg-2025-afl-grand-final/AFL%20Grand%20Final%20Pre-game%202025%20(Channel%207%20LIVE%20Recording).mp4', aspect: 1.3333, name: 'Snoop Dogg - Live AFL Grand Final (2025)' },
  { url: 'https://archive.org/download/youtube-MTC8zYBogY0/MTC8zYBogY0.mp4', aspect: 1.3333, name: 'Eminem - Live at Bonnaroo (2011)' },
  { url: 'https://archive.org/download/saturday-night-live-s-22-e-04-dana-carvey-dr-dre_202501/Saturday%20Night%20Live%20S22E04%20Dana%20Carvey%2C%20Dr%20Dre.mp4', aspect: 1.3333, name: 'Dr. Dre - Live on SNL' },
  { url: 'https://archive.org/download/saturday-night-live-s-24-e-13-brendan-fraser-busta-rhymes_202502/Saturday%20Night%20Live%20S24E13%20Brendan%20Fraser%2C%20Busta%20Rhymes.mp4', aspect: 1.3333, name: 'Busta Rhymes - Live on SNL' },
  { url: 'https://archive.org/download/aaliyah-one-in-a-million-tour-live-at-san-diego-full-show/Aaliyah%20-%20One%20In%20A%20Million%20Tour%20(Live%20at%20San%20Diego)%20Full%20Show.mp4', aspect: 1.3333, name: 'Aaliyah - One In A Million (Live San Diego)' },
  { url: 'https://archive.org/download/portishead-live-bizzare-festival-cologne-germany-1998-08-21-tvrip/Portishead%20Live%20Bizzare%20Festival%2C%20Cologne%2C%20Germany%201998-08-21.mp4', aspect: 1.3333, name: 'Portishead - Live Bizzare Festival (1998)' },
  { url: 'https://archive.org/download/massive-attack-live-at-mtv-europe-1998/Massive%20Attack%20-%20Live%20at%20MTV%20Europe%201998%20(Source).mp4', aspect: 1.3333, name: 'Massive Attack - Live at MTV Europe (1998)' },
  { url: 'https://archive.org/download/gorillaz-demon-days-live-from-the-apollo-theater-harlem-full-show/Gorillaz%20-%20Demon%20Days%20Live%20from%20the%20Apollo%20Theater%2C%20Harlem%20%28Full%20Show%29.mp4', aspect: 1.3333, name: 'Gorillaz - Demon Days Live (Full Show)' },
  { url: 'https://archive.org/download/the-prodigy-moscow-1997/The%20Prodigy%20-%20Live%20at%20Red%20Square%201997%20%28Source%29.mp4', aspect: 1.3333, name: 'The Prodigy - Live at Red Square (1997)' }
]

export type LibraryPreset = { name: string; tracks: Track[] }

export const PlaylistLibrary: LibraryPreset[] = [
  { name: '🌌 IPFS Classics (Default)', tracks: initial },
  { name: '🎸 Internet Archive Recitals (Alt/Hip-Hop/Trip-Hop)', tracks: archiveRecitals }
]

export function selectLibrary(idx: number): boolean {
  if (idx >= 0 && idx < PlaylistLibrary.length) {
    Playlist.tracks = PlaylistLibrary[idx].tracks.map(t => ({ ...t }))
    Playlist.currentIndex = 0
    Playlist.loadToken++
    return true
  }
  return false
}
