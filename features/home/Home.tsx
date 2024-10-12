import {useSignal} from '@quilted/quilt/signals';
import styles from './Home.module.css';

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
    </div>
  );
}
