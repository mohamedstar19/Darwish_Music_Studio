export function coverUrl(name) {
  return name ? `/media/covers/${name}` : null;
}

/** Public JSON shape of a track row from TRACK_SELECT. */
export function shapeTrack(t) {
  if (!t) return null;
  return {
    id: t.id,
    title: t.title,
    year: t.year,
    duration: t.duration_sec,
    playCount: t.play_count,
    cover: coverUrl(t.cover_path || t.work_cover_path),
    artist: t.artist_id ? { id: t.artist_id, name: t.artist_name } : null,
    work: t.work_id ? { id: t.work_id, title: t.work_title } : null,
    category: t.category_id ? { id: t.category_id, name: t.category_name, slug: t.category_slug } : null,
  };
}

export function shapeTracks(rows) {
  return rows.map(shapeTrack);
}

export function shapeWork(w) {
  return {
    id: w.id,
    title: w.title,
    originalTitle: w.original_title,
    kind: w.kind,
    year: w.year,
    studio: w.studio,
    description: w.description,
    cover: coverUrl(w.cover_path),
    trackCount: w.track_count ?? undefined,
  };
}

export function shapeStation(s) {
  return {
    id: s.id,
    slug: s.slug,
    name: s.name,
    description: s.description,
    color: s.color,
    isActive: s.is_active,
    shuffle: s.shuffle,
    requestsMode: s.requests_mode,
    kind: s.kind || 'synced',
    streamUrl: s.kind === 'external' ? s.stream_url : undefined,
    homepage: s.homepage_url || null,
    logo: coverUrl(s.logo_path),
    trackCount: s.track_count ?? undefined,
  };
}

/** Normalize Arabic search text the same way the norm_ar() SQL function does. */
export function normAr(q) {
  return String(q || '')
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .trim();
}
