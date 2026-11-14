# Performance

## Budgets

| Budget                       | Target               | Now (2026-11-14)                               |
| ---------------------------- | -------------------- | ---------------------------------------------- |
| Initial JavaScript (gzip)    | 170 kB or less       | 88.7 kB app shell; the landing page ships none |
| CSS (gzip)                   | -                    | 3.0 kB                                         |
| Lighthouse, mobile, all four | 90 or higher         | Not measured yet: needs the deployed site      |
| LCP / INP / CLS              | 2.5 s / 200 ms / 0.1 | Not measured yet                               |

Sizes come from `npm run build`. Record Lighthouse scores here after the first deploy and after any change made for speed.

## What keeps it fast

- The landing page is plain HTML and CSS with no script.
- The group page and its tabs are separate chunks, loaded only when a group is opened.
- One font family is loaded (Instrument Serif, `display=swap`, preconnected); body text uses the system font.
- Hashed assets are cached for a year (`vercel.json`).
- Every list endpoint is paginated (20 per page, 50 at most), and every filter, join and sort column is indexed.
- Balances are four grouped sums in one query; a page of expenses loads its shares in one extra query, not one per expense.
- Requests that are overtaken by a newer one are cancelled, and a live change refetches only the open tab.
