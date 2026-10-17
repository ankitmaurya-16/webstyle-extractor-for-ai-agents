import { collect } from '../src/collect/index.js';

// executeScript returns this promise's value to the service worker.
export default defineUnlistedScript(() => collect());
