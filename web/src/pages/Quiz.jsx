import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, saveStorage, storage, streamUrl } from '../api.js';
import { Cover, Empty, Loading } from '../components/common.jsx';
import Icon from '../components/Icon.jsx';
import { usePlayer } from '../state/PlayerContext.jsx';

/** خمّن الشارة: hear the first seconds of a theme song and guess the show. */
export default function Quiz() {
  const player = usePlayer();
  const [q, setQ] = useState(null);
  const [error, setError] = useState(null);
  const [answer, setAnswer] = useState(null);
  const [score, setScore] = useState({ right: 0, total: 0, streak: 0 });
  const [best, setBest] = useState(() => storage('dms.quizBest', 0));
  const [clipPlaying, setClipPlaying] = useState(false);
  const clip = useRef(null);
  const stopTimer = useRef(null);

  const stopClip = useCallback(() => {
    clearTimeout(stopTimer.current);
    clip.current?.pause();
    setClipPlaying(false);
  }, []);

  const playClip = useCallback(
    (question, from = 0) => {
      if (!question) return;
      if (player.isPlaying) player.audio.pause();
      stopClip();
      const a = clip.current || new Audio();
      clip.current = a;
      a.src = streamUrl(question.trackId);
      a.currentTime = from;
      a.play().then(() => {
        setClipPlaying(true);
        stopTimer.current = setTimeout(stopClip, question.clipSeconds * 1000);
      }).catch(() => setClipPlaying(false));
    },
    [player, stopClip],
  );

  const nextQuestion = useCallback(async () => {
    stopClip();
    setAnswer(null);
    setError(null);
    try {
      const data = await api.get('/api/quiz/next');
      setQ(data);
      playClip(data);
    } catch (err) {
      setError(err);
    }
  }, [playClip, stopClip]);

  useEffect(() => () => stopClip(), [stopClip]);

  const choose = async (choice) => {
    if (answer) return;
    stopClip();
    const res = await api.post('/api/quiz/answer', { token: q.token, choiceId: choice.id });
    setAnswer({ ...res, picked: choice.id });
    setScore((s) => {
      const next = {
        right: s.right + (res.correct ? 1 : 0),
        total: s.total + 1,
        streak: res.correct ? s.streak + 1 : 0,
      };
      if (next.streak > best) {
        setBest(next.streak);
        saveStorage('dms.quizBest', next.streak);
      }
      return next;
    });
  };

  if (!q && !error) {
    return (
      <div className="page quiz">
        <div className="quiz-start">
          <Icon name="game" size={56} />
          <h1>خمّن الشارة</h1>
          <p className="muted">هنشغلك أول ثواني من شارة كرتون أو أنمي، وإنت تخمّن هي بتاعة أنهي عمل. جاهز؟</p>
          <button type="button" className="btn btn-primary btn-lg" onClick={nextQuestion}>
            يلا نبدأ
          </button>
          {best ? <p className="muted">أعلى سلسلة صح ليك: {best}</p> : null}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page quiz">
        <Empty icon="game" title="اللعبة مش جاهزة لسه">
          {error.message}
        </Empty>
      </div>
    );
  }

  return (
    <div className="page quiz">
      <div className="quiz-score">
        <span>
          النتيجة: <b>{score.right}</b> / {score.total}
        </span>
        <span>🔥 {score.streak}</span>
        <span className="muted">أعلى سلسلة: {best}</span>
      </div>
      <div className="quiz-card">
        <button
          type="button"
          className={`quiz-disc ${clipPlaying ? 'spinning' : ''}`}
          onClick={() => (clipPlaying ? stopClip() : playClip(q))}
          aria-label={clipPlaying ? 'إيقاف المقطع' : 'اسمع المقطع تاني'}
        >
          {answer?.track?.cover ? <Cover src={answer.track.cover} /> : <Icon name={clipPlaying ? 'pause' : 'play'} size={40} />}
        </button>
        <p className="muted">{clipPlaying ? 'ركّز...' : answer ? '' : 'دوس على الأسطوانة عشان تسمع تاني'}</p>
        <div className="quiz-choices">
          {q.choices.map((c) => {
            let cls = '';
            if (answer) {
              if (c.id === answer.correctWorkId) cls = 'right';
              else if (c.id === answer.picked) cls = 'wrong';
            }
            return (
              <button key={c.id} type="button" className={`quiz-choice ${cls}`} onClick={() => choose(c)} disabled={!!answer}>
                {c.title}
              </button>
            );
          })}
        </div>
        {answer ? (
          <div className="quiz-result">
            <h3>{answer.correct ? 'برافو! 🎉' : 'قربت! 😅'}</h3>
            <p>
              دي <Link to={`/track/${answer.track.id}`}>{answer.track.title}</Link>
              {answer.track.work ? ` من "${answer.track.work.title}"` : ''}
            </p>
            <div className="page-header-actions">
              <button type="button" className="btn btn-primary" onClick={nextQuestion}>
                السؤال اللي بعده
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => player.playTrack(answer.track, 'quiz')}>
                <Icon name="play" /> اسمعها كاملة
              </button>
            </div>
          </div>
        ) : null}
      </div>
      {!q ? <Loading /> : null}
    </div>
  );
}
