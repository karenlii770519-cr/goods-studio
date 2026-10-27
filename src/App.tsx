import { Suspense, lazy } from 'react';
import Home from './components/Home';
import { useHashRoute } from './lib/router';

const Editor = lazy(() => import('./components/Editor'));

export default function App() {
  const route = useHashRoute();
  const m = route.match(/^\/p\/([\w-]+)/);
  if (m) {
    return (
      <Suspense fallback={<div className="loading-screen">載入編輯器中…</div>}>
        <Editor key={m[1]} projectId={m[1]} />
      </Suspense>
    );
  }
  return <Home />;
}
