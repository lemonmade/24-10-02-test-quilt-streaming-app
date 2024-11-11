import {useSignal} from '@quilted/quilt/signals';
import {AsyncComponent} from '@quilted/quilt/async';

import styles from './Home.module.css';

const Home2 = AsyncComponent.from(() => import('./Home2'));

export default function Home() {
  const count = useSignal(0);
  return (
    <div>
      <div className={styles.Home}>Hello world!</div>
      <div>Count: {count}</div>
      <button
        onClick={() => {
          count.value += 1;
        }}
      >
        Increment
      </button>

      <Home2 />
    </div>
  );
}
