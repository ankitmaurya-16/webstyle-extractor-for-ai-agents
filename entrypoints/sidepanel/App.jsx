import { useEffect } from 'react';
import * as Toast from '@radix-ui/react-toast';
import * as Tooltip from '@radix-ui/react-tooltip';
import { flushPendingSave, useStore } from './store.js';
import { Home } from './screens/Home.jsx';
import { Extracting } from './screens/Extracting.jsx';
import { Results } from './screens/Results.jsx';
import { History } from './screens/History.jsx';
import { StateScreen } from './screens/StateScreen.jsx';
import { Toasts } from './components/Toasts.jsx';

const SCREENS = {
  home: Home,
  extracting: Extracting,
  results: Results,
  history: History,
  state: StateScreen,
};

export function App() {
  const screen = useStore((s) => s.screen);
  const announcement = useStore((s) => s.announcement);

  useEffect(() => {
    const store = useStore.getState();
    store.init();
    const onHide = () => document.visibilityState === 'hidden' && flushPendingSave();
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      store.dispose();
    };
  }, []);

  const Screen = SCREENS[screen] ?? Home;
  return (
    <Toast.Provider swipeDirection="down">
      <Tooltip.Provider delayDuration={400}>
        <div className="min-h-screen bg-bg text-text" data-screen={screen}>
          <Screen />
        </div>
        <div aria-live="polite" role="status" className="sr-only">
          {announcement}
        </div>
        <Toasts />
      </Tooltip.Provider>
    </Toast.Provider>
  );
}
