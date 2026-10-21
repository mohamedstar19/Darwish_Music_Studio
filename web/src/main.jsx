import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Loading } from './components/common.jsx';
import Layout from './components/Layout.jsx';
import { TrackActionsProvider } from './components/TrackActions.jsx';
import { ArtistPage, CategoryPage, Explore, Search, WorkPage, Years } from './pages/Browse.jsx';
import Car from './pages/Car.jsx';
import Home from './pages/Home.jsx';
import { Favorites, History, Me, Memories, PlaylistPage, Playlists, Settings } from './pages/Library.jsx';
import { Login, Register } from './pages/Auth.jsx';
import Quiz from './pages/Quiz.jsx';
import { RadioList, StationPage } from './pages/Radio.jsx';
import { Legal, NotFound, ReportPage } from './pages/Static.jsx';
import TrackPage from './pages/TrackPage.jsx';
import { AuthProvider } from './state/AuthContext.jsx';
import { PlayerProvider } from './state/PlayerContext.jsx';
import { PresenceProvider } from './state/Presence.jsx';
import { ToastProvider } from './state/ToastContext.jsx';
import './styles.css';

// The admin panel is only loaded for staff who open it.
const Admin = lazy(() => import('./admin/Admin.jsx'));

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <PlayerProvider>
            <PresenceProvider>
              <TrackActionsProvider>
                <Routes>
                  <Route path="/car" element={<Car />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  <Route
                    path="/admin/*"
                    element={
                      <Suspense fallback={<Loading />}>
                        <Admin />
                      </Suspense>
                    }
                  />
                  <Route element={<Layout />}>
                    <Route index element={<Home />} />
                    <Route path="explore" element={<Explore />} />
                    <Route path="search" element={<Search />} />
                    <Route path="category/:slug" element={<CategoryPage />} />
                    <Route path="work/:id" element={<WorkPage />} />
                    <Route path="artist/:id" element={<ArtistPage />} />
                    <Route path="track/:id" element={<TrackPage />} />
                    <Route path="years" element={<Years />} />
                    <Route path="radio" element={<RadioList />} />
                    <Route path="radio/:slug" element={<StationPage />} />
                    <Route path="quiz" element={<Quiz />} />
                    <Route path="favorites" element={<Favorites />} />
                    <Route path="history" element={<History />} />
                    <Route path="playlists" element={<Playlists />} />
                    <Route path="playlist/:id" element={<PlaylistPage />} />
                    <Route path="memories" element={<Memories />} />
                    <Route path="settings" element={<Settings />} />
                    <Route path="me" element={<Me />} />
                    <Route path="legal" element={<Legal />} />
                    <Route path="report" element={<ReportPage />} />
                    <Route path="*" element={<NotFound />} />
                  </Route>
                </Routes>
              </TrackActionsProvider>
            </PresenceProvider>
          </PlayerProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
