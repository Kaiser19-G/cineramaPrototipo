import express from 'express';
import { GENRES, RATINGS, FORMATS, LANGUAGES, MOVIE_STATUSES, isValidPosterUrl } from '../../src/shared/catalogOptions.js';
import { todayInLima } from '../../src/data/limaDate.js';
import { mapAdminMovie } from '../mappers.js';
import { requirePerm, branchScope, failValidation, isRealDate, createAudit } from './common.js';

const TEXT_LIMITS = { title: 120, director: 120, synopsis: 2000 };
const MAX_PRICE = 1000;

// Valida y normaliza los campos de una pelicula. `merged` es el estado final (actual + cambios);
// `given` indica que campos vinieron en la peticion (solo esos generan errores propios).
function validateMovie(merged, given) {
  const errors = {};
  const has = (k) => given.has(k);
  if (has('title')) {
    if (typeof merged.title !== 'string' || !merged.title.trim()) errors.title = 'required';
    else if (merged.title.trim().length > TEXT_LIMITS.title) errors.title = 'too_long';
  }
  if (has('genre') && !GENRES.includes(merged.genre)) errors.genre = merged.genre ? 'invalid_option' : 'required';
  if (has('rating') && !RATINGS.includes(merged.rating)) errors.rating = merged.rating ? 'invalid_option' : 'required';
  if (has('language') && !LANGUAGES.includes(merged.language)) errors.language = merged.language ? 'invalid_option' : 'required';
  if (has('status') && !MOVIE_STATUSES.includes(merged.status)) errors.status = 'invalid_option';
  if (has('duration') && !(Number.isInteger(merged.duration) && merged.duration >= 1 && merged.duration <= 400)) {
    errors.duration = merged.duration === null || merged.duration === '' || merged.duration === undefined ? 'required' : 'out_of_range';
  }
  if (has('format')) {
    const f = merged.format;
    if (!Array.isArray(f) || f.length === 0) errors.format = 'required';
    else if (f.some((x) => !FORMATS.includes(x)) || new Set(f).size !== f.length) errors.format = 'invalid_option';
  }
  for (const k of ['director', 'synopsis']) {
    if (has(k) && merged[k] != null && (typeof merged[k] !== 'string' || merged[k].length > TEXT_LIMITS[k])) {
      errors[k] = typeof merged[k] === 'string' ? 'too_long' : 'invalid';
    }
  }
  for (const k of ['poster', 'backdrop']) {
    if (has(k) && merged[k] != null && !isValidPosterUrl(merged[k])) errors[k] = 'invalid_url';
  }
  for (const k of ['featured', 'presale']) {
    if (has(k) && typeof merged[k] !== 'boolean') errors[k] = 'invalid';
  }
  for (const k of ['releaseDate', 'endDate']) {
    if (has(k) && merged[k] != null && !isRealDate(merged[k])) errors[k] = 'invalid_date';
  }
  // Reglas entre campos: se atribuyen al campo que el usuario puede corregir.
  if (!errors.releaseDate && !errors.endDate && merged.releaseDate && merged.endDate && merged.endDate < merged.releaseDate) {
    errors.endDate = 'date_order';
  }
  if (merged.presale === true && !merged.releaseDate && !errors.releaseDate) errors.releaseDate = 'required_for_presale';
  return errors;
}

const blank = (v) => (typeof v === 'string' && v.trim() === '' ? null : v);

export function createMovies(db, auth, opts = {}) {
  const { clock = Date.now } = opts;
  const audit = createAudit(db, clock);
  const today = () => todayInLima(new Date(clock()));

  const q = {
    all: db.prepare('SELECT * FROM movies ORDER BY id'),
    byId: db.prepare('SELECT * FROM movies WHERE id = ?'),
    enabledInBranch: db.prepare('SELECT 1 FROM movie_branch WHERE movie_id = ? AND branch_id = ? AND active = 1'),
    inBranch: db.prepare(`SELECT m.* FROM movies m JOIN movie_branch mb ON mb.movie_id = m.id
      WHERE mb.branch_id = ? AND mb.active = 1 ORDER BY m.id`),
    mbOfMovie: db.prepare('SELECT * FROM movie_branch WHERE movie_id = ? ORDER BY branch_id'),
    mbRow: db.prepare('SELECT * FROM movie_branch WHERE movie_id = ? AND branch_id = ?'),
    mbAll: db.prepare('SELECT * FROM movie_branch ORDER BY movie_id, branch_id'),
    insert: db.prepare(`INSERT INTO movies (title,genre,duration,rating,status,formats_json,director,language,poster,synopsis,featured,
      release_date,end_date,backdrop,presale,version,created_at,updated_at,updated_by)
      VALUES (@title,@genre,@duration,@rating,@status,@formats_json,@director,@language,@poster,@synopsis,@featured,
      @release_date,@end_date,@backdrop,@presale,1,@now,@now,@by)`),
    update: db.prepare(`UPDATE movies SET title=@title,genre=@genre,duration=@duration,rating=@rating,status=@status,
      formats_json=@formats_json,director=@director,language=@language,poster=@poster,synopsis=@synopsis,featured=@featured,
      release_date=@release_date,end_date=@end_date,backdrop=@backdrop,presale=@presale,version=version+1,updated_at=@now,updated_by=@by
      WHERE id=@id AND version=@version`),
    branchExists: db.prepare('SELECT id FROM branches WHERE id = ?'),
    minHallPrice: db.prepare('SELECT MIN(price_base) p FROM halls WHERE branch_id = ?'),
    futureOfMovie: db.prepare(`SELECT id, branch_id, starts_on, start_time, format FROM screenings
      WHERE movie_id = ? AND starts_on >= ? AND status NOT IN ('cancelled','finished') ORDER BY starts_on, start_time`),
    insertMb: db.prepare(`INSERT INTO movie_branch (movie_id,branch_id,active,start_date,end_date,formats_json,base_price)
      VALUES (@movie_id,@branch_id,@active,@start_date,@end_date,@formats_json,@base_price)`),
    updateMb: db.prepare(`UPDATE movie_branch SET active=@active,start_date=@start_date,end_date=@end_date,
      formats_json=@formats_json,base_price=@base_price WHERE movie_id=@movie_id AND branch_id=@branch_id`),
  };

  const mbOut = (r) => ({
    branchId: r.branch_id, active: !!r.active, startDate: r.start_date, endDate: r.end_date,
    formats: JSON.parse(r.formats_json), basePrice: r.base_price,
  });
  const withBranches = (row, scope) => {
    const rows = q.mbOfMovie.all(row.id).filter((r) => scope === null || r.branch_id === scope);
    return mapAdminMovie(row, today(), rows.map(mbOut));
  };
  const parseId = (req) => { const n = Number(req.params.id); return Number.isInteger(n) && n > 0 ? n : null; };
  const parseVersion = (v) => (Number.isInteger(v) && v >= 1 ? v : null);

  const router = express.Router();

  // Visibilidad: central ve todo; el personal de sede solo lo habilitado en su sede (otro id -> 404).
  const visibleTo = (scope, row) => scope === null || (scope !== 'none' && !!q.enabledInBranch.get(row.id, scope));

  router.get('/', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const scope = branchScope(req);
    if (scope === 'none') return res.json({ movies: [] });
    const rows = scope === null ? q.all.all() : q.inBranch.all(scope);
    const mb = new Map();
    for (const r of q.mbAll.all()) {
      if (scope !== null && r.branch_id !== scope) continue;
      if (!mb.has(r.movie_id)) mb.set(r.movie_id, []);
      mb.get(r.movie_id).push(mbOut(r));
    }
    const t = today();
    res.json({ movies: rows.map((r) => mapAdminMovie(r, t, mb.get(r.id) ?? [])) });
  });

  router.get('/:id', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const id = parseId(req);
    const scope = branchScope(req);
    const row = id && q.byId.get(id);
    if (!row || !visibleTo(scope, row)) return res.status(404).json({ error: 'not_found' });
    res.json({ movie: withBranches(row, scope) });
  });

  router.post('/', requirePerm('create_movie'), (req, res) => {
    const b = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const given = new Set(['title', 'genre', 'duration', 'rating', 'format', 'language', 'status', 'director', 'poster',
      'backdrop', 'synopsis', 'featured', 'presale', 'releaseDate', 'endDate']);
    const m = {
      title: typeof b.title === 'string' ? b.title.trim() : b.title, genre: b.genre, duration: b.duration, rating: b.rating,
      format: b.format, language: b.language, status: b.status ?? 'draft', director: blank(b.director) ?? null,
      poster: blank(b.poster) ?? null, backdrop: blank(b.backdrop) ?? null, synopsis: b.synopsis ?? '',
      featured: b.featured ?? false, presale: b.presale ?? false, releaseDate: blank(b.releaseDate) ?? null, endDate: blank(b.endDate) ?? null,
    };
    const errors = validateMovie(m, given);
    const branches = Array.isArray(b.branches) ? b.branches : null;
    if (Object.keys(errors).length) return failValidation(res, errors);
    const now = clock();
    let id;
    try {
      db.transaction(() => {
        id = q.insert.run({
          title: m.title, genre: m.genre, duration: m.duration, rating: m.rating, status: m.status,
          formats_json: JSON.stringify(m.format), director: m.director, language: m.language, poster: m.poster,
          synopsis: m.synopsis, featured: m.featured ? 1 : 0, release_date: m.releaseDate, end_date: m.endDate,
          backdrop: m.backdrop, presale: m.presale ? 1 : 0, now, by: req.user.id,
        }).lastInsertRowid;
        audit(req, 'movie.create', 'movie', Number(id), null, { status: m.status, presale: m.presale });
        if (branches) {
          const r = applyBranches(Number(id), branches, req, { creating: true });
          if (r.error) throw Object.assign(new Error('x'), { fail: r });
        }
      }).immediate();
    } catch (e) {
      if (e.fail) return res.status(e.fail.status).json(e.fail.body);
      throw e;
    }
    res.status(201).json({ movie: withBranches(q.byId.get(Number(id)), null) });
  });

  router.patch('/:id', requirePerm('edit_movie'), (req, res) => {
    const b = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const id = parseId(req);
    const version = parseVersion(b.version);
    if (version === null) return failValidation(res, { version: 'required' });
    const scope = branchScope(req);
    const out = db.transaction(() => {
        const row = id && q.byId.get(id);
        if (!row || !visibleTo(scope, row)) return { status: 404, body: { error: 'not_found' } };
        if (row.version !== version) return { status: 409, body: { error: 'stale', current: withBranches(row, scope) } };
        const cur = {
          title: row.title, genre: row.genre, duration: row.duration, rating: row.rating, status: row.status,
          format: JSON.parse(row.formats_json), director: row.director, language: row.language, poster: row.poster,
          backdrop: row.backdrop, synopsis: row.synopsis, featured: !!row.featured, presale: !!row.presale,
          releaseDate: row.release_date, endDate: row.end_date,
        };
        const given = new Set();
        const m = { ...cur };
        for (const k of Object.keys(cur)) {
          if (b[k] === undefined) continue;
          given.add(k);
          m[k] = ['director', 'poster', 'backdrop', 'releaseDate', 'endDate'].includes(k) ? (blank(b[k]) ?? null)
            : (k === 'title' && typeof b[k] === 'string' ? b[k].trim() : b[k]);
        }
        const errors = validateMovie(m, given);
        // Una pelicula ya guardada con datos viejos no se bloquea por campos que el usuario no toco.
        if (Object.keys(errors).length) return { status: 400, body: { error: 'validation', errors } };
        const future = q.futureOfMovie.all(id, today());
        if (future.length) {
          const leavesActive = given.has('status') && m.status !== 'active' && row.status === 'active';
          // Solo cuenta si la lista de formatos realmente cambia (el formulario siempre la envia completa).
          const formatsChanged = given.has('format') && JSON.stringify([...m.format].sort()) !== JSON.stringify([...cur.format].sort());
          const dropped = formatsChanged ? future.filter((s) => !m.format.includes(s.format)) : [];
          if (leavesActive) return { status: 409, body: { error: 'has_future_screenings', count: future.length, screenings: future.slice(0, 20).map((s) => ({ id: s.id, branchId: s.branch_id, date: s.starts_on, startTime: s.start_time, format: s.format })) } };
          if (dropped.length) return { status: 409, body: { error: 'has_future_screenings', count: dropped.length, screenings: dropped.slice(0, 20).map((s) => ({ id: s.id, branchId: s.branch_id, date: s.starts_on, startTime: s.start_time, format: s.format })) } };
        }
        const info = q.update.run({
          id, version, title: m.title, genre: m.genre, duration: m.duration, rating: m.rating, status: m.status,
          formats_json: JSON.stringify(m.format), director: m.director, language: m.language, poster: m.poster,
          synopsis: m.synopsis ?? '', featured: m.featured ? 1 : 0, release_date: m.releaseDate, end_date: m.endDate,
          backdrop: m.backdrop, presale: m.presale ? 1 : 0, now: clock(), by: req.user.id,
        });
        if (info.changes !== 1) return { status: 409, body: { error: 'stale', current: withBranches(q.byId.get(id), scope) } };
        audit(req, 'movie.update', 'movie', id, null, { fields: [...given].filter((k) => k !== 'version') });
        return { status: 200, body: { movie: withBranches(q.byId.get(id), scope) } };
      }).immediate();
    res.status(out.status).json(out.body);
  });

  // Asignacion pelicula-sede. Devuelve {error, send} si algo falla (la transaccion llamadora debe revertir).
  function applyBranches(movieId, items, req, { creating = false, replaceAll = false } = {}) {
    const movie = q.byId.get(movieId);
    const movieFormats = JSON.parse(movie.formats_json);
    const fail = (status, body) => ({ error: true, status, body });
    const seen = new Set();
    const errors = {};
    const parsed = [];
    items.forEach((it, i) => {
      const e = {};
      const bid = it?.branchId;
      if (!Number.isInteger(bid) || !q.branchExists.get(bid)) e.branchId = 'invalid';
      else if (seen.has(bid)) e.branchId = 'duplicate';
      else seen.add(bid);
      const active = it?.active ?? true;
      if (typeof active !== 'boolean') e.active = 'invalid';
      const existing = Number.isInteger(bid) ? q.mbRow.get(movieId, bid) : null;
      const formats = it?.formats ?? (existing ? JSON.parse(existing.formats_json) : movieFormats);
      if (!Array.isArray(formats) || formats.length === 0 || formats.some((x) => !FORMATS.includes(x)) || new Set(formats).size !== formats.length) e.formats = 'invalid_option';
      else if (formats.some((x) => !movieFormats.includes(x))) e.formats = 'not_in_movie';
      const startDate = it?.startDate === undefined ? (existing?.start_date ?? null) : blank(it.startDate) ?? null;
      const endDate = it?.endDate === undefined ? (existing?.end_date ?? null) : blank(it.endDate) ?? null;
      if (startDate !== null && !isRealDate(startDate)) e.startDate = 'invalid_date';
      if (endDate !== null && !isRealDate(endDate)) e.endDate = 'invalid_date';
      if (!e.startDate && !e.endDate && startDate && endDate && endDate < startDate) e.endDate = 'date_order';
      let basePrice = it?.basePrice;
      if (basePrice === undefined) basePrice = existing?.base_price ?? q.minHallPrice.get(bid)?.p ?? 0;
      if (typeof basePrice !== 'number' || !Number.isFinite(basePrice) || basePrice < 0 || basePrice > MAX_PRICE) e.basePrice = 'out_of_range';
      if (Object.keys(e).length) errors[i] = e;
      parsed.push({ bid, active, formats, startDate, endDate, basePrice, existing });
    });
    if (Object.keys(errors).length) return fail(400, { error: 'validation', errors: { branches: errors } });

    const today_ = today();
    const future = creating ? [] : q.futureOfMovie.all(movieId, today_);
    const toDisable = new Map(parsed.filter((p) => !p.active).map((p) => [p.bid, p]));
    if (replaceAll) {
      for (const r of q.mbOfMovie.all(movieId)) if (r.active && !seen.has(r.branch_id)) toDisable.set(r.branch_id, { bid: r.branch_id, existing: r });
    }
    const blocked = future.filter((s) => toDisable.has(s.branch_id) && toDisable.get(s.branch_id).existing?.active);
    if (blocked.length) {
      return fail(409, { error: 'has_future_screenings', count: blocked.length,
        screenings: blocked.slice(0, 20).map((s) => ({ id: s.id, branchId: s.branch_id, date: s.starts_on, startTime: s.start_time, format: s.format })) });
    }
    for (const p of parsed) {
      const row = { movie_id: movieId, branch_id: p.bid, active: p.active ? 1 : 0, start_date: p.startDate, end_date: p.endDate,
        formats_json: JSON.stringify(p.formats), base_price: p.basePrice };
      if (p.existing) q.updateMb.run(row); else q.insertMb.run(row);
      audit(req, p.active ? 'movie.enable' : 'movie.disable', 'movie', movieId, p.bid, null);
    }
    if (replaceAll) {
      for (const [bid, p] of toDisable) {
        if (seen.has(bid)) continue;
        db.prepare('UPDATE movie_branch SET active = 0 WHERE movie_id = ? AND branch_id = ?').run(movieId, bid);
        audit(req, 'movie.disable', 'movie', movieId, bid, null);
        void p;
      }
    }
    return { ok: true };
  }

  const putBranches = (req, res, itemsOf, opts2) => {
    const id = parseId(req);
    const out = db.transaction(() => {
      const row = id && q.byId.get(id);
      if (!row) return { status: 404, body: { error: 'not_found' } };
      const items = itemsOf(req);
      if (!items) return { status: 400, body: { error: 'validation', errors: { branches: 'invalid' } } };
      const r = applyBranches(id, items, req, opts2);
      if (r.error) return { status: r.status, body: r.body };
      return { status: 200, body: { movie: withBranches(q.byId.get(id), null) } };
    }).immediate();
    res.status(out.status).json(out.body);
  };

  router.put('/:id/branches', requirePerm('assign_cinema'), (req, res) => putBranches(req, res,
    (r) => (Array.isArray(r.body?.branches) && r.body.branches.length <= 100 ? r.body.branches : null), { replaceAll: true }));

  router.put('/:id/branches/:branchId', requirePerm('assign_cinema'), (req, res) => {
    const branchId = Number(req.params.branchId);
    if (!Number.isInteger(branchId) || branchId <= 0) return res.status(404).json({ error: 'not_found' });
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    putBranches(req, res, () => [{ ...body, branchId }], {});
  });

  return { router };
}
