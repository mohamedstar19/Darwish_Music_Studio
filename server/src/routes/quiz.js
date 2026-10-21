import { many, PLAYABLE, TRACK_SELECT } from '../db.js';
import { shapeTrack } from '../shape.js';
import { httpError } from '../util.js';

/*
 * "خمّن الشارة": play the first seconds of a theme song, pick which show it belongs to.
 * The correct answer travels inside a signed token, so it is checked on the server.
 */
export default async function quizRoutes(app) {
  app.get('/api/quiz/next', async (request) => {
    const category = request.query.category || null;
    const [pick] = await many(
      `${TRACK_SELECT} WHERE ${PLAYABLE} AND t.work_id IS NOT NULL AND t.duration_sec >= 10
       ${category ? 'AND c.slug = $1' : ''}
       ORDER BY random() LIMIT 1`,
      category ? [category] : [],
    );
    if (!pick) throw httpError(404, 'محتاجين أغاني مربوطة بأعمال عشان اللعبة تشتغل');
    const decoys = await many(
      `SELECT id, title FROM (
         SELECT DISTINCT w.id, w.title FROM works w JOIN tracks t ON t.work_id = w.id AND ${PLAYABLE}
         WHERE w.id <> $1
       ) x ORDER BY random() LIMIT 3`,
      [pick.work_id],
    );
    if (decoys.length < 1) throw httpError(404, 'محتاجين على الأقل عملين مختلفين عشان اللعبة تشتغل');
    const choices = [...decoys, { id: pick.work_id, title: pick.work_title }].sort(() => Math.random() - 0.5);
    const token = app.jwt.sign({ q: pick.id, a: pick.work_id }, { expiresIn: '10m' });
    return {
      token,
      trackId: pick.id,
      clipSeconds: 8,
      choices: choices.map((c) => ({ id: c.id, title: c.title })),
    };
  });

  app.post('/api/quiz/answer', async (request) => {
    const { token, choiceId } = request.body || {};
    let payload;
    try {
      payload = app.jwt.verify(String(token || ''));
    } catch {
      throw httpError(400, 'السؤال انتهى، جرب سؤال جديد');
    }
    const [track] = await many(`${TRACK_SELECT} WHERE t.id = $1`, [payload.q]);
    return {
      correct: Number(choiceId) === payload.a,
      correctWorkId: payload.a,
      track: shapeTrack(track),
    };
  });
}
