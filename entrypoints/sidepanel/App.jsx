import { useEffect } from 'react';
import * as Toast from '@radix-ui/react-toast';
import * as Tooltip from '@radix-ui/react-tooltip';
import { flushPendingSave, useStore } from './store.js';
import { Home } from './screens/Home.jsx';
import { Extracting } from './screens/Extracting.jsx';
import { Results } from './screens/Results.jsx';
import { History } from './screens/History.jsx';
import { StateScreen } from './screens/StateScreen.jsx';
import { Settings } from './screens/Settings.jsx';
import { Picking } from './screens/Picking.jsx';
import { Diff } from './screens/Diff.jsx';
import { MapScreen } from './screens/MapScreen.jsx';
import { Toasts } from './components/Toasts.jsx';
import { Dialogs } from './components/Dialogs.jsx';

const SCREENS = {
  home: Home,
  extracting: Extracting,
  results: Results,
  history: History,
  state: StateScreen,
  settings: Settings,
  picking: Picking,
  diff: Diff,
  map: MapScreen,
};

export function App() {
  const screen = useStore((s) => s.screen);
  const announcement = useStore((s) => s.announcement);
  const panelTheme = useStore((s) => s.settings.panelTheme);

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

  // Appearance (F42): System leaves data-theme unset so the OS preference applies live.
  useEffect(() => {
    const root = document.documentElement;
    if (panelTheme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', panelTheme);
  }, [panelTheme]);

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
        <Dialogs />
      </Tooltip.Provider>
    </Toast.Provider>
  );
}
