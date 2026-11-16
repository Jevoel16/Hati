import {
  createContext,
  useContext,
  useEffect,
  useId,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.ts';
import { tourReducer, type Tour, type TourEvent } from '../lib/machines.ts';
import { useSession } from '../lib/session.tsx';
import type { User } from '../lib/types.ts';

// Each step outlines its element (data-tour="...") when that element is on the current page.
const STEPS = [
  {
    title: 'Start a group',
    body: 'Hati means to split. Make a group for a household, trip or team, pick its currency, then share the invite link or QR code.',
    target: 'new-group',
  },
  {
    title: 'Add an expense',
    body: 'Inside a group, Add expense records who paid and splits it equally, by exact amounts or by percentage.',
    target: 'add-expense',
  },
  {
    title: 'Read the balances',
    body: 'The Balances tab says who is owed and who owes, and updates the moment someone adds something.',
    target: 'balances',
  },
  {
    title: 'Settle up',
    body: 'Fewest payments lists the transfers that clear the group. Pay, then press Mark as paid. In peso groups, Show QR fills in the exact amount.',
    target: 'settle-up',
  },
] as const;

const TourContext = createContext<(() => void) | null>(null);

// For the Account page's "Replay the tour" button.
export function useReplayTour(): () => void {
  const replay = useContext(TourContext);
  if (!replay) throw new Error('useReplayTour must be used inside TourProvider.');
  return replay;
}

export function TourProvider({ user, children }: { user: User; children: ReactNode }) {
  const { refresh } = useSession();
  const navigate = useNavigate();
  const [tour, dispatch] = useReducer(
    (state: Tour, event: TourEvent) => tourReducer(state, event, STEPS.length),
    { status: 'idle' },
  );

  // First visit only; once seen, the tour starts again only from the Account page.
  useEffect(() => {
    if (user.status === 'active' && !user.onboarded) dispatch('start');
  }, [user.status, user.onboarded]);

  const send = (event: TourEvent) => {
    const next = tourReducer(tour, event, STEPS.length);
    dispatch(event);
    if (next.status === 'done' || next.status === 'skipped') {
      document.getElementById('main')?.focus();
      if (!user.onboarded) void api('POST', '/auth/onboarded').then(refresh, () => {});
    }
  };
  const replay = () => {
    navigate('/groups');
    dispatch('replay');
  };

  return (
    <TourContext.Provider value={replay}>
      {children}
      {tour.status === 'showing' && <TourPanel step={tour.step} send={send} />}
    </TourContext.Provider>
  );
}

// Not a modal: the page stays readable and usable behind it, for screen readers too.
function TourPanel({ step, send }: { step: number; send: (event: TourEvent) => void }) {
  const { title, body, target } = STEPS[step]!;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const { pathname } = useLocation();
  const isLast = step === STEPS.length - 1;

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  useEffect(() => {
    const element = document.querySelector(`[data-tour="${target}"]`);
    element?.classList.add('tour-target');
    return () => element?.classList.remove('tour-target');
  }, [target, pathname]);

  // Escape closes the tour, unless it is closing an open dialog instead.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) send('skip');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  return (
    <section className="tour" aria-labelledby={titleId}>
      <p className="tour-count" aria-live="polite">
        Step {step + 1} of {STEPS.length}
      </p>
      <h2 id={titleId} ref={headingRef} tabIndex={-1}>
        {title}
      </h2>
      <p>{body}</p>
      <div className="row row--between">
        <button type="button" className="button button--link" onClick={() => send('skip')}>
          Skip tour
        </button>
        <span className="row">
          {step > 0 && (
            <button type="button" className="button button--quiet" onClick={() => send('back')}>
              Back
            </button>
          )}
          <button type="button" className="button" onClick={() => send('next')}>
            {isLast ? 'Finish' : 'Next'}
          </button>
        </span>
      </div>
    </section>
  );
}
