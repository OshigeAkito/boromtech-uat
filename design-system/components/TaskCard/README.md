# TaskCard

One small, checkable piece of a client job, with its status, payout, freelancer deadline and the actions the current viewer can take.

**Reading order.** Status and payout first, because they decide whether someone opens the card. Then title, then the client job it belongs to. The due line sits under a hairline with the assignee.

**Deadline.** Pass the freelancer deadline (`due`), never the customer's. The card counts calendar days: "4 days left", warning color at 2 days or fewer, danger when overdue. Once work is submitted the deadline stops shouting, because the freelancer has done their part.

**Actions.** The consumer passes only the actions the viewer is allowed to take, as `Button` children. At most one `primary`, and it is the next step in the lifecycle:

| Status | Viewer | Primary action |
| --- | --- | --- |
| `open` | freelancer | Claim task |
| `assigned`, `changes` | assignee | Submit for review |
| `submitted` | admin | Pass & grade (with `StarRating`), plus a `danger` "Request changes" |
| `approved` | admin | Mark ฿4,500 paid |
| `paid` | anyone | none |

**Review.** `review.grade` 1–5 shows stars and feedback. `grade: 0` means changes were requested; set `status: 'changes'` too.

Use `compact` when cards sit inside a job's own panel, so they read as children of it.
