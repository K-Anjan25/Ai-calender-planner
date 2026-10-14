/**
 * Imported for its side effect, and imported *first*: jsdom globals must exist before `react-dom`
 * and `@testing-library/react` are evaluated. ES module imports are hoisted, so the only reliable
 * ordering is a module that does the work at import time.
 */
import { installDom, stubFetch } from './dom'

installDom()
stubFetch()
