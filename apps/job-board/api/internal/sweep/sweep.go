// Package sweep is `crew-api sweep`: one nightly pass of orphan cleanup, run from GitHub Actions as
// bt_sweeper. Postgres picks what may be deleted (never-attached or detached files untouched for 30 days)
// and hands back DELETE specs; this loop deletes and reports back. The row is the owner and the object is
// derived, so the sweep can only remove objects Postgres has already declared unowned.
//
// Crash halfway: unreported ids are re-issued next run, and re-deleting a missing object is a 404 we count
// as success. So every failure mode converges by just running again.
package sweep

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"sort"
	"strings"

	"boromtech.com/crew-api/internal/gate"
	"boromtech.com/crew-api/internal/r2"
)

// MaxDeletes bounds one run; whatever is left goes tomorrow.
const MaxDeletes = 2000

// Run loops gate.sweep(purged) → DELETE each spec → report the ids, until Postgres offers nothing or the
// rail is reached. Any DELETE answered with something other than 2xx or 404 aborts the run without
// reporting that batch, and is returned as an error (the workflow goes red).
func Run(ctx context.Context, g *gate.Gate, store *r2.Client, log *slog.Logger) (deleted int, err error) {
	purged := []string{}
	for {
		raw, err := g.Sweep(ctx, purged)
		if err != nil {
			return deleted, err
		}
		env, err := gate.Parse(raw)
		if err != nil {
			return deleted, err
		}
		if env.Status != http.StatusOK {
			return deleted, fmt.Errorf("sweep: status %d", env.Status)
		}
		if len(env.Presign) == 0 {
			return deleted, nil
		}
		if deleted >= MaxDeletes {
			log.Info("sweep: rail reached, rest next run", "deleted", deleted)
			return deleted, nil
		}
		labels := make([]string, 0, len(env.Presign))
		for l := range env.Presign {
			labels = append(labels, l)
		}
		sort.Strings(labels)
		ids := map[string]bool{}
		for _, label := range labels {
			spec := env.Presign[label]
			if spec.Method != http.MethodDelete {
				return deleted, fmt.Errorf("sweep: refused %s spec %q", spec.Method, label)
			}
			status, err := store.Execute(ctx, spec, nil)
			if err != nil {
				return deleted, err
			}
			if (status < 200 || status > 299) && status != http.StatusNotFound {
				return deleted, fmt.Errorf("sweep: DELETE %s: %d", spec.Key, status)
			}
			deleted++
			ids[strings.TrimSuffix(label, ":t")] = true // labels are '<id>' and '<id>:t'
		}
		purged = purged[:0]
		for id := range ids {
			purged = append(purged, id)
		}
		log.Info("sweep: batch", "files", len(purged), "deleted", deleted)
	}
}
